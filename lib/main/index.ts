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

    atom.packages.once('activated',() => {

        // TODO: Setup the error reporter:
        errorView.start();

        // Observe editors happening
        editorWatch = atom.workspace.observeTextEditors((editor: AtomCore.IEditor) => {

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
                        errorView.setErrors(programManager.getErrorsForFile(filePath));
                    });

                    // And save
                    editor.onDidSave((event) => {
                        // TODO: store by file path
                        var output = program.emitFile(filePath);
                        errorView.showEmittedMessage(output);
                    });

                } catch (ex) {
                    console.error('Solve this in atom-typescript', ex);
                    throw ex;
                }
            }
        });

    });
}

export function deactivate() {
    if (statusBarMessage) statusBarMessage.destroy();
    editorWatch.dispose();
}

export function serialize(): PackageState {
    return {};
}

export function deserialize() {
    /* do any tear down here */
}
