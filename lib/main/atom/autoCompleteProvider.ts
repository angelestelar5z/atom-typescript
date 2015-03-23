/// <reference path='../../globals'/>

// more: https://github.com/atom-community/autocomplete-plus/wiki/Provider-API

///ts:import=parent
import parent = require('../../worker/parent'); ///ts:import:generated
///ts:import=atomConfig
import atomConfig = require('./atomConfig'); ///ts:import:generated
import ts = require('typescript');
import fs = require('fs');
///ts:import=atomUtils
import atomUtils = require('./atomUtils'); ///ts:import:generated
import escape = require('escape-html');

var fuzzaldrin = require('fuzzaldrin');
var CSON = require("season");

declare module autocompleteplus {
    /** What gets passed into the handler */
    export interface RequestOptions {
        editor: AtomCore.IEditor;
        bufferPosition: TextBuffer.IPoint; // the position of the cursor
        prefix: string;
        scopeDescriptor: { scopes: string[] };
    }

    /** The suggestion */
    export interface Suggestion {
        //Either text or snippet is required

        text?: string;
        snippet?: string;

        replacementPrefix?: string;

        rightLabel?: string;
        rightLabelHTML?: string;
        className?: string; //'globe'

        atomTS_IsReference?: {
            relativePath: string
        };
        atomTS_IsImport?: {
            relativePath: string
        };
    }

    /** What the provider needs to implement */
    export interface Provider {
        selector: string;
        getSuggestions: (options: RequestOptions) => Promise<Suggestion[]>;
        onDidInsertSuggestion?: (args: { editor: AtomCore.IEditor; triggerPosition: TextBuffer.IPoint; suggestion: Suggestion }) => any;
    }
}

function kindToColor(kind: string) {
    switch (kind) {
        case 'interface':
            return 'rgb(16, 255, 0)';
        case 'keyword':
            return 'rgb(0, 207, 255)';
        case 'class':
            return 'rgb(255, 0, 194)';
        default:
            return 'white';
    }
}

export function triggerAutocompletePlus() {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace.getActiveTextEditor()),
        'autocomplete-plus:activate');
}

// the structure stored in the CSON snippet file
interface SnippetDescriptor {
    prefix: string;
    body: string;
}
interface SnippetsContianer {
    [name: string]: SnippetDescriptor;
}


// this is the structure we use to speed up the lookup by avoiding having to
// iterate over the object properties during the requestHandler
// this will take a little longer during load but I guess that is better than
// taking longer at each key stroke
interface SnippetDetail {
    body: string;
    name: string;
}

var tsSnipPrefixLookup: { [prefix: string]: SnippetDetail; } = Object.create(null);
function loadSnippets() {
    var confPath = atom.getConfigDirPath();
    CSON.readFile(confPath + "/packages/atom-typescript/snippets/typescript-snippets.cson",
        (err, snippetsRoot) => {
            if (err) return;
            if (!snippetsRoot || !snippetsRoot['.source.ts']) return;

            // rearrange/invert the way this can be looked up: we want to lookup by prefix
            // this way the lookup gets faster because we dont have to iterate over the
            // properties of the object
            var tsSnippets: SnippetsContianer = snippetsRoot['.source.ts'];
            for (var snippetName in tsSnippets) {
                if (tsSnippets.hasOwnProperty(snippetName)) {
                    // if the file contains a prefix multiple times only
                    // the last will be active because the previous ones will be overwritten
                    tsSnipPrefixLookup[tsSnippets[snippetName].prefix] = {
                        body: tsSnippets[snippetName].body,
                        name: snippetName
                    }
                }
            }
        });
}
loadSnippets();

export var provider: autocompleteplus.Provider = {
    selector: '.source.ts',
    getSuggestions: (options: autocompleteplus.RequestOptions): Promise<autocompleteplus.Suggestion[]>=> {
        var filePath = options.editor.getPath();

        // We refuse to work on files that are not on disk.
        if (!filePath) return Promise.resolve([]);
        if (!fs.existsSync(filePath)) return Promise.resolve([]);

        // If we are looking at reference or require path support file system completions
        var pathMatchers = ['reference.path.string', 'require.path.string'];
        var lastScope = options.scopeDescriptor.scopes[options.scopeDescriptor.scopes.length - 1];

        // For file path completions
        if (pathMatchers.some(p=> lastScope === p)) {
            return parent.getRelativePathsInProject({ filePath, prefix: options.prefix })
                .then((resp) => {
                return resp.files.map(file => {
                    var suggestion: autocompleteplus.Suggestion = {
                        text: file.relativePath,
                        replacementPrefix: resp.endsInPunctuation ? '' : options.prefix,
                        rightLabelHTML: '<span>' + file.relativePath + '</span>',

                    };
                    if (lastScope == 'reference.path.string') {
                        suggestion.atomTS_IsReference = {
                            relativePath: file.relativePath
                        };
                    }

                    if (lastScope == 'require.path.string') {
                        suggestion.atomTS_IsImport = {
                            relativePath: file.relativePath
                        };
                    }

                    return suggestion;
                });
            });
        }
        else {

            var position = atomUtils.getEditorPositionForBufferPosition(options.editor, options.bufferPosition);

            var promisedSuggestions: Promise<autocompleteplus.Suggestion[]>
                = parent.getCompletionsAtPosition({
                    filePath: filePath,
                    position: position,
                    prefix: options.prefix,
                    maxSuggestions: atomConfig.maxSuggestions
                })
                    .then((resp) => {
                        
                    var completionList = resp.completions;
                    var suggestions = completionList.map((c): autocompleteplus.Suggestion => {

                        if (c.snippet) // currently only function completions are snippet
                        {
                            return {
                                snippet: c.snippet,
                                replacementPrefix: '',
                                rightLabel: 'signature'
                            };
                        }
                        else {
                            return {
                                text: c.name,
                                replacementPrefix: resp.endsInPunctuation ? '' : options.prefix,
                                rightLabelHTML: '<span style="color: ' + kindToColor(c.kind) + '">' + c.display + '</span>',
                            };
                        }
                    });


                    // see if we have a snippet for this prefix
                    if (tsSnipPrefixLookup[options.prefix]) {
                        // you only get the snippet suggested after you have typed
                        // the full trigger word/ prefex
                        // and then it replaces a keyword/match that might also be present, e.g. "class"
                        let suggestion: autocompleteplus.Suggestion = {
                            snippet: tsSnipPrefixLookup[options.prefix].body,
                            replacementPrefix: options.prefix,
                            rightLabelHTML: "snippet: " + options.prefix,
                        };
                        suggestions.unshift(suggestion);
                    }

                    return suggestions;
                });

            return promisedSuggestions;
        }
    },
    onDidInsertSuggestion: (options) => {
        if (options.suggestion.atomTS_IsReference || options.suggestion.atomTS_IsImport) {
            options.editor.moveToBeginningOfLine();
            options.editor.selectToEndOfLine();

            if (options.suggestion.atomTS_IsReference)
                options.editor.replaceSelectedText(null, function() { return '/// <reference path="' + options.suggestion.atomTS_IsReference.relativePath + '"/>'; });
            if (options.suggestion.atomTS_IsImport) {
                var alias = options.editor.getSelectedText().match(/^import\s*(\w*)\s*=/)[1];
                options.editor.replaceSelectedText(null, function() { return "import " + alias + ' = require("'+ options.suggestion.atomTS_IsImport.relativePath + '");'; });
            }
            options.editor.moveToEndOfLine();
        }
    }
}
