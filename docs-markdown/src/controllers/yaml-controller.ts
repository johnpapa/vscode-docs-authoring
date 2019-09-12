"use strict";

import { readFileSync } from "fs";
import { files } from "node-dir";
import { basename, dirname, extname, join, relative } from "path";
import { QuickPickItem, window, workspace } from "vscode";
import { insertedTocEntry, invalidTocEntryPosition, noHeading, noHeadingSelected } from "../constants/log-messages";
import { insertContentToEditor, noActiveEditorMessage, sendTelemetryData, showStatusMessage } from "../helper/common";

const telemetryCommand: string = "updateTOC";
let commandOption: string;

export function yamlCommands() {
  // tslint:disable-next-line: no-shadowed-variable
  const commands = [
    { command: insertTocEntry.name, callback: insertTocEntry },
    { command: insertTocEntryWithOptions.name, callback: insertTocEntryWithOptions },
    { command: insertExpandableParentNode.name, callback: insertExpandableParentNode },
  ];
  return commands;
}

export function insertTocEntry() {
  commandOption = "tocEntry";
  checkForPreviousEntry(false);
}
export function insertTocEntryWithOptions() {
  commandOption = "tocEntryWithOptions";
  checkForPreviousEntry(true);
}

export function insertExpandableParentNode() {
  commandOption = "expandableParentNode";
  createParentNode();
}

export function showQuickPick(options: boolean) {
  const markdownExtensionFilter = [".md"];
  const headingTextRegex = /^(# )(.*)/gm;
  let folderPath: string = "";
  let fullPath: string = "";

  if (workspace.workspaceFolders) {
    folderPath = workspace.workspaceFolders[0].uri.fsPath;
  }

  // tslint:disable-next-line: no-shadowed-variable
  files(folderPath, (err: any, files: any) => {
    if (err) {
      window.showErrorMessage(err);
      throw err;
    }

    const items: QuickPickItem[] = [];
    files.sort();
    files.filter((file: any) => markdownExtensionFilter.indexOf(extname(file.toLowerCase())) !== -1).forEach((file: any) => {
      items.push({ label: basename(file), description: dirname(file) });
    });

    // show the quick pick menu
    const selectionPick = window.showQuickPick(items);
    selectionPick.then((qpSelection) => {
      const editor = window.activeTextEditor;
      if (!editor) {
        noActiveEditorMessage();
        return;
      }

      if (!qpSelection) {
        return;
      }

      if (qpSelection.description) {
        fullPath = join(qpSelection.description, qpSelection.label);
      }

      const content = readFileSync(fullPath, "utf8");
      const headings = content.match(headingTextRegex);

      if (!headings) {
        window.showErrorMessage(noHeading);
        return;
      }
      let headingName = headings.toString().replace("# ", "");
      const activeFilePath = editor.document.fileName;
      const href = relative(activeFilePath, fullPath);
      // format href: remove addtional leading segment (support windows, macos and linux), set path separators to standard
      const formattedHrefPath = href.replace("..\\", "").replace("../", "").replace(/\\/g, "/");
      window.showInputBox({
        value: headingName,
        valueSelection: [0, 0],
      }).then((val) => {
        if (!val) {
          window.showInformationMessage(noHeadingSelected);
        }
        if (val) {
          headingName = val;
        }
        createEntry(headingName, formattedHrefPath, options);
      });
    });
  });
}

export function createEntry(name: string, href: string, options: boolean) {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }
  const position = editor.selection.active;
  const cursorPosition = position.character;
  const attributeSpace = " ";

  if (cursorPosition === 0 && !options) {
    const tocEntryLineStart =
      `- name: ${name}
  href: ${href}`
    insertContentToEditor(editor, insertTocEntry.name, tocEntryLineStart);
  }

  if (cursorPosition > 0 && !options) {
    const currentPosition = editor.selection.active.character;
    const tocEntryIndented =
      `- name: ${name}
  ${attributeSpace.repeat(currentPosition)}href: ${href}`
    insertContentToEditor(editor, insertTocEntry.name, tocEntryIndented);
  }

  if (cursorPosition === 0 && options) {
    const tocEntryWithOptions =
      `- name: ${name}
  displayname: #optional string for searching TOC
  href: ${href}
  uid: #optional string
  expanded: #true or false, false is default`;
    insertContentToEditor(editor, insertTocEntryWithOptions.name, tocEntryWithOptions);
  }

  if (cursorPosition > 0 && options) {
    const currentPosition = editor.selection.active.character;
    const tocEntryWithOptionsIndented =
      `- name: ${name}
  ${attributeSpace.repeat(currentPosition)}displayname: #optional string for searching TOC
  ${attributeSpace.repeat(currentPosition)}href: ${href}
  ${attributeSpace.repeat(currentPosition)}uid: #optional string
  ${attributeSpace.repeat(currentPosition)}expanded: #true or false, false is default`;
    insertContentToEditor(editor, insertTocEntryWithOptions.name, tocEntryWithOptionsIndented);
  }
  showStatusMessage(insertedTocEntry);
  sendTelemetryData(telemetryCommand, commandOption);
}

export function checkForPreviousEntry(options: boolean) {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }
  const position = editor.selection.active;
  const cursorPosition = position.character;
  const currentLine = position.line;

  // case 1: beginning of toc/first line
  if (currentLine === 0) {
    if (cursorPosition === 0) {
      launchQuickPick(options)
    } else {
      window.showErrorMessage(invalidTocEntryPosition);
      return;
    }
  }

  // case 2: cursor is at the beginning of a line
  if (cursorPosition == 0) {
    launchQuickPick(options);
  }

  // case 3: ensure that the cursor position lines up with the aligned name scalar above
  if (cursorPosition >= 1) {
    const startPosition = editor.selection.active.line;
    let startingCursorPosition: number;
    const totalLines = editor.document.lineCount;
    let i = startPosition;
    let nameIndex: boolean = false;
    const nameScalar = /^\s+(-\sname:)/;

    for (i = startPosition; i < totalLines; i--) {
      startingCursorPosition = editor.selection.active.character;
      if (i === 0) {
        break;
      }
      const lineData = editor.document.lineAt(i);
      const lineText = lineData.text;
      if (lineText.match(nameScalar)) {
        const itemScalarPosition = lineData.firstNonWhitespaceCharacterIndex;
        if (itemScalarPosition === startingCursorPosition) {
          nameIndex = true;
          break;
        } else {
          nameIndex = false
          continue;
        }
      }
    }

    if (nameIndex) {
      launchQuickPick(options);
    } else {
      window.showErrorMessage(invalidTocEntryPosition);
    }
  }
}

export function createParentNode() {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }
  const position = editor.selection.active;
  const cursorPosition = position.character;
  const attributeSpace = " ";

  if (cursorPosition === 0) {
    const parentNodeLineStart = `- name:
  items:
  - name:
    href:`
    insertContentToEditor(editor, insertTocEntry.name, parentNodeLineStart);
  }
  if (cursorPosition > 0) {
    const currentPosition = editor.selection.active.character;
    const parentNodeIndented =
      `- name:
  ${attributeSpace.repeat(currentPosition)}items:
  ${attributeSpace.repeat(currentPosition)}- name:
  ${attributeSpace.repeat(currentPosition + 2)}href:`
    insertContentToEditor(editor, insertTocEntry.name, parentNodeIndented);
  }
}

export function launchQuickPick(options: boolean) {
  if (!options) {
    showQuickPick(false);
  } else {
    showQuickPick(true);
  }
}