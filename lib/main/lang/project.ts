///ts:ref=globals
/// <reference path="../../globals.ts"/> ///ts:ref:generated

import ts = require('typescript');
import path = require('path');
import mkdirp = require('mkdirp');
import fs = require('fs');
import os = require('os');

export import languageServiceHost = require('./languageServiceHost2');
import tsconfig = require('../tsconfig/tsconfig');
import utils = require('./utils');

export class Project {
    public languageServiceHost: languageServiceHost.LanguageServiceHost;
    public languageService: ts.LanguageService;

    constructor(public projectFile: tsconfig.TypeScriptProjectFileDetails) {
        this.languageServiceHost = new languageServiceHost.LanguageServiceHost(projectFile);
        this.languageService = ts.createLanguageService(this.languageServiceHost, ts.createDocumentRegistry());
    }

    public build(): BuildOutput {
        var outputs = this.projectFile.project.files.map((filename) => {
            return this.emitFile(filename);
        });

        return {
            outputs: outputs,
            counts: {
                inputFiles: this.projectFile.project.files.length,
                outputFiles: utils.selectMany(outputs.map((out) => out.outputFiles)).length,
                errors: utils.selectMany(outputs.map((out) => out.errors)).length,
                emitErrors: outputs.filter(out => out.emitError).length
            }
        };
    }

    emitFile = (filePath: string): EmitOutput => {
        var services = this.languageService;
        var output = services.getEmitOutput(filePath);
        var emitDone = !output.emitSkipped;
        var errors: TSError[] = [];

        // Emit is no guarantee that there are no errors
        var allDiagnostics = services.getCompilerOptionsDiagnostics()
            .concat(services.getSyntacticDiagnostics(filePath))
            .concat(services.getSemanticDiagnostics(filePath));

        allDiagnostics.forEach(diagnostic => {
            // happens only for 'lib.d.ts' for some reason
            if (!diagnostic.file) return;

            var startPosition = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            errors.push(diagnosticToTSError(diagnostic));
        });

        output.outputFiles.forEach(o => {
            mkdirp.sync(path.dirname(o.name));
            fs.writeFileSync(o.name, o.text, "utf8");
        });

        var outputFiles = output.outputFiles.map((o) => o.name);
        if (path.extname(filePath) == '.d.ts') {
            outputFiles.push(filePath);
        }

        return {
            outputFiles: outputFiles,
            success: emitDone && !errors.length,
            errors: errors,
            emitError: !emitDone
        };
    }

    formatDocument(filePath: string, cursor: languageServiceHost.Position): { formatted: string; cursor: languageServiceHost.Position } {
        var textChanges = this.languageService.getFormattingEditsForDocument(filePath, this.projectFile.project.format);
        var formatted = this.formatCode(this.languageServiceHost.getScriptContent(filePath), textChanges);

        // Get new cursor based on new content
        var newCursor = this.formatCursor(this.languageServiceHost.getIndexFromPosition(filePath, cursor), textChanges);

        return { formatted: formatted, cursor: this.languageServiceHost.getPositionFromIndex(filePath, newCursor) };
    }

    formatDocumentRange(filePath: string, start: languageServiceHost.Position, end: languageServiceHost.Position): string {
        var st = this.languageServiceHost.getIndexFromPosition(filePath, start);
        var ed = this.languageServiceHost.getIndexFromPosition(filePath, end);
        var textChanges = this.languageService.getFormattingEditsForRange(filePath, st, ed, this.projectFile.project.format);

        // Sadly ^ these changes are still relative to *start* of file. So lets fix that.
        textChanges.forEach((change) => change.span = { start: change.span.start - st, length: change.span.length });

        var formatted = this.formatCode(this.languageServiceHost.getScriptContent(filePath).substring(st, ed), textChanges);
        return formatted;
    }

    // from https://github.com/Microsoft/TypeScript/issues/1651#issuecomment-69877863
    private formatCode(orig: string, changes: ts.TextChange[]): string {
        var result = orig;
        for (var i = changes.length - 1; i >= 0; i--) {
            var change = changes[i];
            var head = result.slice(0, change.span.start);
            var tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }

    private formatCursor(cursor: number, changes: ts.TextChange[]): number {
        // If cursor is inside a text change move it to the end of that text change
        var cursorInsideChange = changes.filter((change) => (change.span.start < cursor) && ((change.span.start + change.span.length) > cursor))[0];
        if (cursorInsideChange) {
            cursor = cursorInsideChange.span.start + cursorInsideChange.span.length;
        }
        // Get all text changes that are *before* the cursor and determine the net *addition / subtraction* and apply that to the cursor.
        var beforeCursorChanges = changes.filter(change => change.span.start < cursor);
        var netChange = 0;
        beforeCursorChanges.forEach(change => netChange = netChange - (change.span.length - change.newText.length));

        return cursor + netChange;
    }
}

// TODO: move these interfaces *and* the associated functions out of "project" (and this file)
export interface BuildOutput {
    outputs: EmitOutput[];
    counts: {
        inputFiles: number;
        outputFiles: number;
        errors: number;
        emitErrors: number;
    }
}
export interface EmitOutput {
    outputFiles: string[];
    success: boolean;
    errors: TSError[];
    emitError: boolean;
}
export interface TSError {
    filePath: string;
    startPos: languageServiceHost.Position;
    endPos: languageServiceHost.Position;
    message: string;
    preview: string;
}

export function diagnosticToTSError(diagnostic: ts.Diagnostic): TSError {
    var filePath = diagnostic.file.fileName;
    var startPosition = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    var endPosition = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);

    return {
        filePath: filePath,
        startPos: { line: startPosition.line, ch: startPosition.character },
        endPos: { line: endPosition.line, ch: endPosition.character },
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        preview: diagnostic.file.text.substr(diagnostic.start, diagnostic.length),
    };
}
