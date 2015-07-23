import atomConfig = require("../atomConfig");
import atomUtils = require("../atomUtils");
import {uriForPath} from "../atomUtils";
import * as sp from "atom-space-pen-views";
import * as view from "./view";
import React = require('react');
import * as parent from "../../../worker/parent";

/**
 * Eventually
 */
namespace rts {
    /** 0 based length */
    export function indent(indent: number) {
        return Array(indent + 1).join().split('').map(i => "\u00a0\u00a0\u00a0\u00a0");
    }

    /** A quick and dirty abstraction over state */
    export function getterSetter<T>(component: React.Component<any, any>, initial?: T) {
        var _value: T = initial;
        return {
            get: (): T => {
                return _value;
            },
            set: (value: T) => {
                _value = value;
                component.forceUpdate();
            }
        }
    }
}

interface Props {
}
interface State {
}

class MyComponent extends React.Component<Props, State>{
    state = {};
    constructor(props: Props) {
        super(props);
    }

    _editor: AtomCore.IEditor;
    set editor(value: AtomCore.IEditor) {
        this._editor = value
        this.forceUpdate();
    }
    get editor() {
        return this._editor;
    }

    _tree: SemanticTreeNode[] = [];
    set tree(value: SemanticTreeNode[]) {
        this._tree = value
        this.forceUpdate();
    }
    get tree() {
        return this._tree;
    }
    componentDidMount() {
        // We listen to a few things

        // Editor scrolling
        var editorScrolling: AtomCore.Disposable;
        // Editor changing
        var editorChanging: AtomCore.Disposable;

        let subscribeToEditor = (editor: AtomCore.IEditor) => {
            this.editor = editor;

            parent.getSemtanticTree({ filePath: editor.getPath() }).then((res) => {
                this.tree = res.nodes;
            });

            // Subscribe to stop scrolling
            editorScrolling = this.editor.onDidChangeCursorPosition(() => {
                this.forceUpdate();
            });

            // Subscribe to stop changing
            editorChanging = this.editor.onDidStopChanging(() => {
                parent.getSemtanticTree({ filePath: editor.getPath() }).then((res) => {
                    this.tree = res.nodes;
                });
            });

            panel.show();
        }

        let unsubscribeToEditor = () => {
            panel.hide();
            this.tree = [];
            if (!this.editor) return;

            editorScrolling.dispose();
            editorChanging.dispose();
            this.forceUpdate();
        }

        // We don't start unless there is work to do ... so work
        subscribeToEditor(atomUtils.getActiveEditor());

        // Tab changing
        atom.workspace.onDidChangeActivePaneItem((editor: AtomCore.IEditor) => {
            if (atomUtils.onDiskAndTs(editor) && atomConfig.showSemanticView) {
                subscribeToEditor(editor);
            }
            else {
                unsubscribeToEditor();
            }
        });
    }

    /**
     * Actually component will never unmount ... so no unsubs for now
     */
    componentWillUnmount() {
    }
    whileRendering = {
        lastCursorLine: null as number
    }
    render() {
        this.whileRendering = {
            lastCursorLine: this.editor ? this.editor.getLastCursor().getBufferRow() : null
        };
        return <div>
            {this.tree.map(node => this.renderNode(node, 0)) }
            </div>;
    }

    renderNode(node: SemanticTreeNode, indent: number) {
        return <div className="node" onClick={ (event) => {this.gotoNode(node); event.stopPropagation();} } data-start={node.start.line} data-end={node.end.line}>
            {rts.indent(indent) }
            <span className={this.getIconForKind(node.kind) + ' ' + this.isSelected(node) }>{node.text}</span>
                {node.subNodes.map(sn=> this.renderNode(sn, indent + 1)) }
            </div>
    }

    getIconForKind(kind: string) {
        return `icon icon-${kind}`;
    }
    isSelected(node: SemanticTreeNode) {
        if (this.whileRendering.lastCursorLine == null) return '';
        else {
            if (node.start.line <= this.whileRendering.lastCursorLine && node.end.line >= this.whileRendering.lastCursorLine) {
                return 'selected';
            }
            return '';
        }
    }
    gotoNode(node: SemanticTreeNode) {
        var gotoLine = node.start.line;
        this.editor.setCursorBufferPosition([gotoLine, 0]);
    }
}

export class SemanticView extends view.View<any> {

    public mainContent: JQuery;
    public get rootDomElement() {
        return this.mainContent[0];
    }
    static content() {
        return this.div({ class: 'atomts-semantic-view native-key-bindings' }, () => {
            this.div({ outlet: 'mainContent' });
        });
    }

    constructor(public config) {
        super(config);
    }

    /**
     * This function exists because the react component needs access to `panel` which needs access to `SemanticView`.
     * So we lazily create react component after panel creation
     */
    started = false
    start() {
        if (this.started) return;
        this.started = true;
        React.render(React.createElement(MyComponent, {}), this.rootDomElement);
    }
}



export var mainView: SemanticView;
var panel: AtomCore.Panel;
export function attach() {

    // Only attach once
    if (mainView) {
        return;
    }

    mainView = new SemanticView({});
    panel = atom.workspace.addRightPanel({ item: mainView, priority: 1000, visible: atomConfig.showSemanticView && atomUtils.isActiveEditorOnDiskAndTs() });

    if (panel.isVisible()) {
        mainView.start();
    }
}

export function toggle() {
    if (panel.isVisible()) {
        atomConfig.showSemanticView = (false);
        panel.hide();
    } else {
        atomConfig.showSemanticView = (true);
        panel.show();
        mainView.start();
    }
}
