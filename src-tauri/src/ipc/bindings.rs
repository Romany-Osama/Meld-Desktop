//! Generated TypeScript bindings (S5-011, D-047).
//!
//! `specta_builder()` (lib.rs) collects every command with its argument and result types.
//! The test below renders them, plus a `CommandMap` keyed by the invoked command name with
//! the named (camelCase) arguments, into `src/ipc/bindings.ts`, and fails when the committed
//! file differs. Regenerate with `MELD_WRITE_BINDINGS=1 cargo test bindings_are_up_to_date`.
#![cfg(test)]

use heck::ToLowerCamelCase;
use specta::datatype::FunctionResultVariant;
use specta_typescript::{self as ts, BigIntExportBehavior, ExportError, Typescript};
use tauri_specta::{ExportContext, LanguageExt};

const HEADER: &str = "// Generated from the Rust commands by `MELD_WRITE_BINDINGS=1 cargo test bindings_are_up_to_date`\n// (src-tauri/src/ipc/bindings.rs, S5-011). Do not edit by hand.\n/* eslint-disable */\n// @ts-nocheck: generated helpers include unused declarations; the exported types are still checked where used.";

struct MeldTypescript(Typescript);

impl LanguageExt for MeldTypescript {
    type Error = ExportError;

    fn render(&self, cfg: &ExportContext) -> Result<String, ExportError> {
        let base = self.0.render(cfg)?;
        let mut entries = Vec::new();
        for function in &cfg.commands {
            let mut args = Vec::new();
            for (name, datatype) in function.args() {
                let rendered = ts::datatype(
                    &self.0,
                    &FunctionResultVariant::Value(datatype.clone()),
                    &cfg.type_map,
                )?;
                // Optional arguments (`Option<T>`, `Opt<T>`) may be left out of the call.
                let optional = rendered.ends_with("| null");
                args.push(format!(
                    "{}{}: {}",
                    name.to_lower_camel_case(),
                    if optional { "?" } else { "" },
                    rendered
                ));
            }
            let result = match function.result() {
                Some(FunctionResultVariant::Result(ok, _))
                | Some(FunctionResultVariant::Value(ok)) => ts::datatype(
                    &self.0,
                    &FunctionResultVariant::Value(ok.clone()),
                    &cfg.type_map,
                )?,
                None => "null".to_owned(),
            };
            entries.push(format!(
                "  {}: {{ args: {{ {} }}; result: {} }};",
                function.name(),
                args.join("; "),
                result
            ));
        }
        entries.sort();
        Ok(format!(
            "{base}\n/** Every command by its invoked name, with named arguments (as `invoke` sends them). */\nexport type CommandMap = {{\n{}\n}};\n",
            entries.join("\n")
        ))
    }

    fn format(&self, _path: &std::path::Path) -> Result<(), ExportError> {
        Ok(())
    }
}

fn render() -> String {
    let language = MeldTypescript(
        Typescript::default()
            .header(HEADER)
            .bigint(BigIntExportBehavior::Number),
    );
    crate::specta_builder()
        .export_str(language)
        .expect("bindings render")
}

#[test]
fn bindings_are_up_to_date() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/ipc/bindings.ts");
    let rendered = render();
    if std::env::var("MELD_WRITE_BINDINGS").as_deref() == Ok("1") {
        std::fs::write(&path, &rendered).expect("write bindings");
        return;
    }
    let committed = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    assert!(
        committed == rendered,
        "src/ipc/bindings.ts is out of date; run MELD_WRITE_BINDINGS=1 cargo test bindings_are_up_to_date"
    );
}

#[test]
fn every_registered_command_is_in_the_bindings() {
    let rendered = render();
    let lib = include_str!("../lib.rs");
    let start = lib.find("collect_commands![").expect("collect_commands");
    let list = &lib[start + "collect_commands![".len()..];
    let list = &list[..list.find(']').expect("end")];
    let names: Vec<&str> = list
        .split(',')
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(|path| path.rsplit("::").next().unwrap_or(path))
        .collect();
    assert!(names.len() > 100);
    for name in names {
        assert!(
            rendered.contains(&format!("  {name}: {{ args:")),
            "{name} missing from CommandMap"
        );
    }
}
