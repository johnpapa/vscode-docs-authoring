import { reporter } from "../../helper/telemetry";
import { readFile, writeFile } from "graceful-fs";
import { postError } from "../../helper/common";
import { handleYamlMetadata } from "./handleYamlMetadata";
import { showProgress } from "./utilities";
import { handleMarkdownMetadata } from "./handleMarkdownMetadata";
const jsdiff = require("diff");

const telemetryCommand: string = "applyCleanup";

/**
 * Searches through all directories from rootPath
 * and cleans up Yaml Metadata values that have single array items
 * then converts the array to single item.
 */
export function handleSingleValuedMetadata(progress: any, file: string, percentComplete: number, files: Array<string> | null, index: number | null) {
    reporter.sendTelemetryEvent("command", { command: telemetryCommand });
    const message = "Single-Valued metadata";
    if (file.endsWith(".yml") || file.endsWith(".md")) {
        return new Promise((resolve, reject) => {
            readFile(file, "utf8", (err, data) => {
                if (err) {
                    postError(`Error: ${err}`);
                    reject();
                }
                const origin = data;
                if (file.endsWith(".yml")) {
                    data = handleYamlMetadata(data);
                } else if (file.endsWith(".md")) {
                    if (data.startsWith("---")) {
                        const regex = new RegExp(`^(---)([^]+?)(---)$`, "m");
                        const metadataMatch = data.match(regex);
                        if (metadataMatch) {
                            data = handleMarkdownMetadata(data, metadataMatch[2]);
                        }
                    }
                }
                resolve({ origin, data });
            });
        }).then((result: any) => {
            const diff = jsdiff.diffChars(result.origin, result.data)
                .some((part: { added: any; removed: any; }) => {
                    return part.added || part.removed;
                });
            return new Promise((resolve, reject) => {
                if (diff) {
                    writeFile(file, result.data, (error) => {
                        if (error) {
                            postError(`Error: ${error}`);
                            reject();
                        }
                        percentComplete = showProgress(index, files, percentComplete, progress, message);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    } else { return Promise.resolve(); }
}
