// Typed command calls (S5-011, D-047). `CommandMap` is generated from the Rust commands
// (src/ipc/bindings.ts), so a renamed command, a missing or misspelled argument or a wrong
// argument type fails `tsc` instead of failing at run time.
import { invoke } from "@tauri-apps/api/core";
import type { CommandMap } from "../ipc/bindings";

/**
 * What a caller may send for a Rust type: serde fills a missing `Option` field with `None`, so nullable fields are
 * optional in arguments (nested objects and arrays included).
 */
export type Loosen<T> = T extends readonly (infer U)[]
  ? Loosen<U>[]
  : T extends object
    ? { [P in keyof T as null extends T[P] ? P : never]?: Loosen<T[P]> | undefined } & {
        [P in keyof T as null extends T[P] ? never : P]: Loosen<T[P]>;
      }
    : T;

export type CommandName = keyof CommandMap;
export type CommandArgs<K extends CommandName> = Loosen<CommandMap[K]["args"]>;
/** `()` results arrive as `null`; callers treat them as `void`. */
export type CommandResult<K extends CommandName> = [CommandMap[K]["result"]] extends [null]
  ? void
  : CommandMap[K]["result"];

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ArgsParam<K extends CommandName> = {} extends CommandArgs<K> ? [args?: CommandArgs<K>] : [args: CommandArgs<K>];

/** Calls a backend command by name with its named arguments. */
export function call<K extends CommandName>(name: K, ...args: ArgsParam<K>): Promise<CommandResult<K>> {
  return invoke<CommandResult<K>>(name, args[0] as Record<string, unknown> | undefined);
}
