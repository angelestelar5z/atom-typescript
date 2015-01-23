///ts:ref=globals
/// <reference path="../globals.ts"/> ///ts:ref:generated

import path = require('path');

// Make sure we have the packages we depend upon
var apd = require('atom-package-dependencies');
///ts:import=programManager
import programManager = require('./lang/programManager'); ///ts:import:generated
///ts:import=errorView
import errorView = require('./atom/errorView'); ///ts:import:generated

// globals
var statusBar;
var statusBarMessage;
var editorWatch: AtomCore.Disposable;
var autoCompleteWatch: AtomCore.Disposable;

export interface PackageState {
}

export function activate(state: PackageState) {

    // Don't activate if we have a dependency that isn't available
    var linter = apd.require('linter');
    var acp = apd.require('autocomplete-plus');
    if (!linter || !acp) {
        apd.install(function () {
            atom.notifications.addSuccess("Some dependent packages were required for atom-typescript. These are now installed. Best you restart atom just this once.", { dismissable: true });
        });

        return;
    }

    // Observe editors happening
    editorWatch = atom.workspace.observeTextEditors((editor: AtomCore.IEditor) => {

        // Setup the error reporter:
        errorView.start();

        var filePath = editor.getPath();
        var filename = path.basename(filePath);
        var ext = path.extname(filename);

        if (ext == '.ts') {
            try {
                var program = programManager.getOrCreateProgram(filePath);

                // Now observe editors changing
                editor.onDidStopChanging(() => {
                    
                    // Update the file
                    program.languageServiceHost.updateScript(filePath, editor.getText());

                    // Get any errors in the project
                    // TODO: This is commented out as calling this on *all* initial loads means the last one wins. Need a better strategy.
                    // TODO: setErrors / clearErrors PER file 
                    errorView.setErrors(programManager.getErrorsForFile(filePath));
                });

                // And save
                editor.onDidSave((event) => {
                    // TODO: store by file path
                    program.languageServiceHost.updateScript(filePath, editor.getText());
                    var output = program.emitFile(filePath);
                    errorView.showEmittedMessage(output);
                });

            } catch (ex) {
                console.error('Solve this in atom-typescript', ex);
                throw ex;
            }
        }
    });

    // Registering an autocomplete provider
    atom.packages.activatePackage('autocomplete-plus').then(pkg => {
        var autoComplete = pkg.mainModule;
    });

    // Setup custom commands
    // NOTE: these need to be added to the package.json."activationEvents" as well as possibly keymaps
    atom.commands.add('atom-workspace', 'typescript:format-code',(e) => {
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor) return e.abortKeyBinding();
        if (path.extname(editor.getPath()) !== '.ts') return e.abortKeyBinding();

        var filePath = editor.getPath();
        var program = programManager.getOrCreateProgram(filePath);
        var selection = editor.getSelectedBufferRange();
        if (selection.isEmpty()) {
            editor.setText(program.formatDocument(filePath));
        } else {
            var formatted = program.formatDocumentRange(filePath, { line: selection.start.row, ch: selection.end.column }, { line: selection.end.row, ch: selection.end.column });
            editor.setTextInBufferRange(selection, formatted);
        }
    });
}

export function deactivate() {
    if (statusBarMessage) statusBarMessage.destroy();
    if (editorWatch) editorWatch.dispose();
    if (autoCompleteWatch) autoCompleteWatch.dispose();
}

export function serialize(): PackageState {
    return {};
}

export function deserialize() {
    /* do any tear down here */
}

var foo = 123;
