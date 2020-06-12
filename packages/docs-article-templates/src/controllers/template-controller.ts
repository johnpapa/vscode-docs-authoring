'use strict';

import {
	generateTimestamp,
	templateDirectory,
	docsAuthoringDirectory,
	postWarning
} from '../helper/common';
import { logRepoData } from '../helper/github';
import { showStatusMessage, sendTelemetryData } from '../helper/common';
import { files } from 'node-dir';
import {
	addUnitToQuickPick,
	displayTemplateList,
	moduleQuickPick,
	newModuleMessage,
	newUnitMessage,
	templateNameMetadata
} from '../strings';
import { getUnitName, showLearnFolderSelector } from '../helper/unit-module-builder';
import { basename, dirname, extname, join, parse } from 'path';
import { readFileSync } from 'fs';
import { QuickPickItem, window } from 'vscode';
import { applyDocsTemplate } from '../controllers/quick-pick-controller';
import { cleanupDownloadFiles } from '../helper/cleanup';

const telemetryCommand: string = 'templateSelected';
let commandOption: string;
export let moduleTitle;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fm = require('front-matter');
const markdownExtensionFilter = ['.md'];

export function applyTemplateCommand() {
	const commands = [{ command: applyTemplate.name, callback: applyTemplate }];
	return commands;
}

export async function applyTemplate() {
	// generate current date/time for timestamp, clean up template directory and download copy of the template repo.
	generateTimestamp();
	cleanupDownloadFiles(true);
	downloadRepo();
}

export function displayTemplates() {
	showStatusMessage(displayTemplateList);

	let templateName;
	let yamlContent;
	files(templateDirectory, (err, files) => {
		if (err) {
			showStatusMessage(err);
			throw err;
		}

		// data structure used to store file name and path info for quick pick and template source.
		const quickPickMap = new Map();

		{
			files
				.filter((file: any) => markdownExtensionFilter.indexOf(extname(file.toLowerCase())) !== -1)
				.forEach((file: any) => {
					if (basename(file).toLowerCase() !== 'readme.md') {
						const filePath = join(dirname(file), basename(file));
						const fileContent = readFileSync(filePath, 'utf8');
						const updatedContent = fileContent.replace('{@date}', '{date}');
						try {
							yamlContent = fm(updatedContent);
						} catch (error) {
							// suppress js-yaml error, does not impact
							// https://github.com/mulesoft-labs/yaml-ast-parser/issues/9#issuecomment-402869930
						}
						templateName = yamlContent.attributes[templateNameMetadata];

						if (templateName) {
							quickPickMap.set(templateName, join(dirname(file), basename(file)));
						}

						if (!templateName) {
							quickPickMap.set(basename(file), join(dirname(file), basename(file)));
						}
					}
				});
		}

		// push quickMap keys to QuickPickItems
		const templates: QuickPickItem[] = [];
		templates.push({ label: moduleQuickPick });
		const activeFilePath = window.activeTextEditor.document.fileName;
		const activeFile = parse(activeFilePath).base;
		if (activeFile === 'index.yml') {
			templates.push({ label: addUnitToQuickPick });
		}
		for (const key of quickPickMap.keys()) {
			templates.push({ label: key });
		}

		templates.sort(function (a, b) {
			const firstLabel = a.label.toUpperCase();
			const secondLabel = b.label.toUpperCase();
			if (firstLabel < secondLabel) {
				return -1;
			}
			if (firstLabel > secondLabel) {
				return 1;
			}
			return 0;
		});

		window.showQuickPick(templates).then(
			qpSelection => {
				if (!qpSelection) {
					return;
				}

				if (qpSelection.label === moduleQuickPick) {
					showLearnFolderSelector();
					commandOption = 'new-module';
					showStatusMessage(newModuleMessage);
				}

				if (qpSelection.label === addUnitToQuickPick) {
					getUnitName(true, activeFilePath);
					commandOption = 'additional-unit';
					showStatusMessage(newUnitMessage);
				}

				if (
					qpSelection.label &&
					qpSelection.label !== moduleQuickPick &&
					qpSelection.label !== addUnitToQuickPick
				) {
					const template = qpSelection.label;
					const templatePath = quickPickMap.get(template);
					applyDocsTemplate(templatePath);
					commandOption = template;
					showStatusMessage(`Applying ${template} template.`);
				}
				sendTelemetryData(telemetryCommand, commandOption);
			},
			(error: any) => {
				showStatusMessage(error);
			}
		);
	});
}

// download a copy of the template repo to the "docs authoring" directory.  no .git-related files will be generated by this process.
export async function downloadRepo() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const download = require('download-git-repo');
	const templateRepo = 'MicrosoftDocs/content-templates';
	download(templateRepo, docsAuthoringDirectory, err => {
		if (err) {
			postWarning(err ? `Error: Cannot connect to ${templateRepo}` : 'Success');
			showStatusMessage(err ? `Error: Cannot connect to ${templateRepo}` : 'Success');
		} else {
			displayTemplates();
			logRepoData();
		}
	});
}
