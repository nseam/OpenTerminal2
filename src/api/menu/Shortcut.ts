// Represents the state of a shortcut.
export enum ShortcutState
{
  Pressed,
  Released
}

export class Shortcut
{
  // Whether Alt key is needed.
  alt!: boolean;

  // Whether Shift key is needed.
  shift!: boolean;

  // Whether Ctrl key is needed.
  ctrl!: boolean;

  // Key to be pressed.
  char!: string;

  // Mouse button to be pressed/released.
  mouseButton!: number;

  // Whether key/button is to be pressed or released.
  state: ShortcutState = ShortcutState.Pressed;

  // In which tools (tool ids) the shortcut is available. Leave empty to make it available in all tools.
  contextTools: string[] = [];
}