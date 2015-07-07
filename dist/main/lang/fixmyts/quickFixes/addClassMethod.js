var ast = require("../astUtils");
var os_1 = require("os");
function getIdentifierAndClassNames(error) {
    var errorText = error.messageText;
    if (typeof errorText !== 'string') {
        console.error('I have no idea what this is:', errorText);
        return undefined;
    }
    ;
    var match = errorText.match(/Property \'(\w+)\' does not exist on type \'(\w+)\'./);
    if (!match)
        return;
    var identifierName = match[1], className = match[2];
    return { identifierName: identifierName, className: className };
}
function getLastNameAfterDot(text) {
    return text.substr(text.lastIndexOf('.') + 1);
}
function getTypeStringForNode(node, typeChecker) {
    var type = typeChecker.getTypeAtLocation(node);
    return ts.displayPartsToString(ts.typeToDisplayParts(typeChecker, type)).replace(/\s+/g, ' ');
}
var AddClassMethod = (function () {
    function AddClassMethod() {
        this.key = AddClassMethod.name;
    }
    AddClassMethod.prototype.canProvideFix = function (info) {
        var relevantError = info.positionErrors.filter(function (x) { return x.code == ts.Diagnostics.Property_0_does_not_exist_on_type_1.code; })[0];
        if (!relevantError)
            return;
        if (info.positionNode.kind !== 66)
            return;
        var match = getIdentifierAndClassNames(relevantError);
        if (!match)
            return;
        var identifierName = match.identifierName, className = match.className;
        return { display: "Add method \"" + identifierName + "\" to current class " + className };
    };
    AddClassMethod.prototype.provideFix = function (info) {
        var relevantError = info.positionErrors.filter(function (x) { return x.code == ts.Diagnostics.Property_0_does_not_exist_on_type_1.code; })[0];
        var identifier = info.positionNode;
        var identifierName = identifier.text;
        var className = getIdentifierAndClassNames(relevantError).className;
        var typeString = 'any';
        var parentOfParent = identifier.parent.parent;
        if (parentOfParent.kind == 178
            && parentOfParent.operatorToken.getText().trim() == '=') {
            var binaryExpression = parentOfParent;
            typeString = getTypeStringForNode(binaryExpression.right, info.typeChecker);
        }
        else if (parentOfParent.kind == 165) {
            var nativeTypes = ['string', 'number', 'boolean', 'object'];
            var abc = 'abcdefghijklmnopqrstuvwxyz';
            var argsAlphabet = abc.split('');
            var argsAlphabetPosition = 0;
            var argName = '';
            var argCount = 0;
            var callExp = parentOfParent;
            var typeStringParts = ['('];
            var args = [];
            callExp.arguments.forEach(function (arg) {
                var argType = getTypeStringForNode(arg, info.typeChecker);
                if (nativeTypes.indexOf(argType) != -1
                    || argType == 'null'
                    || argType == 'undefined'
                    || argType == 'RegExp'
                    || argType.indexOf('{') != -1
                    || argType.indexOf('=>') != -1) {
                    if (argType.indexOf('=>') != -1) {
                        argName = "" + info.typeChecker.getTypeAtLocation(arg).symbol.name + argCount++ + "Fn";
                    }
                    else {
                        argName = argsAlphabet[argsAlphabetPosition];
                        argsAlphabet[argsAlphabetPosition] += argsAlphabet[argsAlphabetPosition].substring(1);
                        argsAlphabetPosition++;
                        argsAlphabetPosition %= abc.length;
                    }
                }
                else {
                    var argTypeName = argType.replace('typeof ', '');
                    argName = argTypeName;
                    if (argType.indexOf('typeof ') == -1) {
                        var firstLower = argName[0].toLowerCase();
                        if (argName.length == 1) {
                            argName = firstLower;
                        }
                        else {
                            argName = firstLower + argName.substring(1);
                        }
                    }
                    argName += argCount.toString();
                    argCount++;
                }
                if (argType == 'null' || argType == 'undefined') {
                    argType = 'any';
                }
                args.push(argName + ": " + argType);
            });
            typeStringParts.push(args.join(', '));
            typeStringParts.push("): any { /* implement-me */ }");
            typeString = typeStringParts.join('');
        }
        var memberTarget = ast.getNodeByKindAndName(info.program, 211, className);
        if (!memberTarget) {
            memberTarget = ast.getNodeByKindAndName(info.program, 212, className);
        }
        if (!memberTarget) {
            return [];
        }
        var targetDeclaration = memberTarget;
        var firstBrace = targetDeclaration.getChildren().filter(function (x) { return x.kind == 14; })[0];
        var indentLength = info.service.getIndentationAtPosition(memberTarget.getSourceFile().fileName, firstBrace.end, info.project.projectFile.project.formatCodeOptions);
        var indent = Array(indentLength + info.project.projectFile.project.formatCodeOptions.IndentSize + 1).join(' ');
        var refactoring = {
            span: {
                start: firstBrace.end,
                length: 0
            },
            newText: "" + os_1.EOL + indent + "public " + identifierName + typeString,
            filePath: targetDeclaration.getSourceFile().fileName
        };
        return [refactoring];
    };
    return AddClassMethod;
})();
exports.AddClassMethod = AddClassMethod;
