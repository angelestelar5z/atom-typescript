
export var forEachChild = ts.forEachChild;

export function forEachChildRecursive<T>(node: ts.Node, cbNode: (node: ts.Node, depth: number) => T, depth = 0): T {
    var res = cbNode(node, depth);
    forEachChildRecursive(node, cbNode, depth + 1);
    return res;
}

export function getNodeByKindAndName(program: ts.Program, kind: ts.SyntaxKind, name: string): ts.Node {
    let found: ts.Node = undefined;

    function findNode(node: ts.Node) {
        if (node.kind == kind) {
            // Now lookup name:
            if (node.kind == ts.SyntaxKind.ClassDeclaration) {
                if ((<ts.ClassDeclaration>node).name.text == name) {
                    found = node;
                }
            }
            if (node.kind == ts.SyntaxKind.InterfaceDeclaration) {
                if ((<ts.InterfaceDeclaration>node).name.text == name) {
                    found = node;
                }
            }
        }

        if (!found) { forEachChild(node, findNode); }
    }

    for (let file of program.getSourceFiles()) {
        forEachChild(file, findNode);
    }

    return found;
}


export function getSourceFileImports(srcFile: ts.SourceFile): string[] {
    var modules: string[] = [];
    getImports(srcFile, modules);
    return modules;
}

// WIP
// export function getSourceFileImportsWithPositions(srcFile: ts.SourceFile)
//     : { path: string; start: number; end: number; }[] {
//     var modules: string[] = [];
//     getImports(srcFile, modules);
//     return modules;
// }


// https://github.com/Microsoft/TypeScript/issues/2621#issuecomment-90986004
function getImports(searchNode: ts.Node, importedModules: string[]) {
    ts.forEachChild(searchNode, node => {
        // Vist top-level import nodes
        if (node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration || node.kind === ts.SyntaxKind.ExportDeclaration) {
            let moduleNameExpr = getExternalModuleName(node);
            // if they have a name, that is a string, i.e. not alias defition `import x = y`
            if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
                importedModules.push((<ts.LiteralExpression>moduleNameExpr).text);
            }
        }
        else if (node.kind === ts.SyntaxKind.ModuleDeclaration && (<ts.ModuleDeclaration>node).name.kind === ts.SyntaxKind.StringLiteral) {
            // Ambient module declaration
            getImports((<ts.ModuleDeclaration>node).body, importedModules);
        }
    });
}
function getExternalModuleName(node: ts.Node): ts.Expression {
    if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        return (<ts.ImportDeclaration>node).moduleSpecifier;
    }
    if (node.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
        let reference = (<ts.ImportEqualsDeclaration>node).moduleReference;
        if (reference.kind === ts.SyntaxKind.ExternalModuleReference) {
            return (<ts.ExternalModuleReference>reference).expression;
        }
    }
    if (node.kind === ts.SyntaxKind.ExportDeclaration) {
        return (<ts.ExportDeclaration>node).moduleSpecifier;
    }
}
