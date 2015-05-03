import {QuickFix} from "./quickFix";
/**
 * This exists to register the quick fixes
 */
import AddClassMember from "./addClassMember";
import AddImportStatement from "./addImportStatement";
import EqualsToEquals from "./equalsToEquals";
import QuotesToQuotes from "./quotesToQuotes";
import QuotesToTemplate from "./quoteToTemplate";
import StringConcatToTemplate from "./stringConcatToTemplate";
import TypeAssertPropertyAccessToAny from "./typeAssertPropertyAccessToAny";
import TypeAssertPropertyAccessToType from "./typeAssertPropertyAccessToType";
export var allQuickFixes: QuickFix[] = [
    new AddClassMember(),
    new AddImportStatement(),
    new EqualsToEquals(),
    new StringConcatToTemplate(),
    new QuotesToQuotes(),
    new QuotesToTemplate(),
    new TypeAssertPropertyAccessToAny(),
    new TypeAssertPropertyAccessToType(),
];
