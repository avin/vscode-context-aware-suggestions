import * as assert from 'assert';
import { isInJsxTextContent, isInHtmlTextContent } from '../extension';

// Cursor marker - using a character that won't appear in normal code
const CURSOR = '⌘';

/**
 * Helper to find cursor position marked with ⌘ in text
 * Returns { text: string (without marker), offset: number }
 */
function parseCursor(textWithCursor: string): { text: string; offset: number } {
    const offset = textWithCursor.indexOf(CURSOR);
    if (offset === -1) {
        throw new Error(`No cursor marker ${CURSOR} found in text`);
    }
    const text = textWithCursor.slice(0, offset) + textWithCursor.slice(offset + CURSOR.length);
    return { text, offset };
}

/**
 * Test helper that checks if cursor is between tags
 */
function testJsx(textWithCursor: string, expected: boolean, description?: string) {
    const { text, offset } = parseCursor(textWithCursor);
    const result = isInJsxTextContent(text, offset);
    assert.strictEqual(result, expected, description || `JSX: "${textWithCursor.replace(CURSOR, '|')}" should be ${expected}`);
}

function testHtml(textWithCursor: string, expected: boolean, description?: string) {
    const { text, offset } = parseCursor(textWithCursor);
    const result = isInHtmlTextContent(text, offset);
    assert.strictEqual(result, expected, description || `HTML: "${textWithCursor.replace(CURSOR, '|')}" should be ${expected}`);
}

suite('JSX/TSX Cursor Position Detection', () => {
    
    suite('Basic tag content', () => {
        test('cursor between simple tags', () => {
            testJsx('<div>⌘</div>', true);
        });

        test('cursor in text content', () => {
            testJsx('<div>hello ⌘world</div>', true);
        });

        test('cursor at start of content', () => {
            testJsx('<div>⌘hello</div>', true);
        });

        test('cursor at end of content', () => {
            testJsx('<div>hello⌘</div>', true);
        });

        test('cursor in empty content', () => {
            testJsx('<span>⌘</span>', true);
        });
    });

    suite('Inside tag definition (should be false)', () => {
        test('cursor in tag name', () => {
            testJsx('<di⌘v>', false);
        });

        test('cursor after tag name before >', () => {
            testJsx('<div⌘>', false);
        });

        test('cursor in opening tag with attributes', () => {
            testJsx('<div ⌘className="test">', false);
        });

        test('cursor in attribute name', () => {
            testJsx('<div class⌘Name="test">', false);
        });

        test('cursor in attribute value', () => {
            testJsx('<div className="⌘test">', false);
        });

        test('cursor in attribute value middle', () => {
            testJsx('<div className="te⌘st">', false);
        });

        test('cursor between attributes', () => {
            testJsx('<div className="test" ⌘id="foo">', false);
        });

        test('cursor in closing tag', () => {
            testJsx('<div></di⌘v>', false);
        });

        test('cursor after < in closing tag', () => {
            testJsx('<div></⌘div>', false);
        });
    });

    suite('JSX expressions { }', () => {
        test('cursor inside empty JSX expression', () => {
            testJsx('<div>{⌘}</div>', false);
        });

        test('cursor inside JSX expression with content', () => {
            testJsx('<div>{foo⌘Bar}</div>', false);
        });

        test('cursor inside JSX expression with function call', () => {
            testJsx('<div>{getData()⌘}</div>', false);
        });

        test('cursor after JSX expression', () => {
            testJsx('<div>{foo}⌘</div>', true);
        });

        test('cursor before JSX expression', () => {
            testJsx('<div>⌘{foo}</div>', true);
        });

        test('cursor between JSX expressions', () => {
            testJsx('<div>{foo}⌘{bar}</div>', true);
        });

        test('cursor in text between expression and tag', () => {
            testJsx('<div>{foo} text ⌘</div>', true);
        });

        test('nested JSX in expression - inside nested tag content', () => {
            testJsx('<div>{condition && <span>⌘</span>}</div>', false);
        });
    });

    suite('Nested tags', () => {
        test('cursor in nested tag content', () => {
            testJsx('<div><span>⌘</span></div>', true);
        });

        test('cursor in deeply nested content', () => {
            testJsx('<div><span><strong>⌘text</strong></span></div>', true);
        });

        test('cursor between sibling tags', () => {
            testJsx('<div><span></span>⌘<span></span></div>', true);
        });

        test('cursor in outer content after nested element', () => {
            testJsx('<div><span>inner</span>⌘outer</div>', true);
        });
    });

    suite('Self-closing tags', () => {
        test('cursor inside self-closing tag', () => {
            testJsx('<input ⌘/>', false);
        });

        test('cursor after self-closing tag (no parent)', () => {
            testJsx('<input />⌘', false);
        });

        test('cursor after self-closing tag inside parent', () => {
            testJsx('<div><input />⌘</div>', true);
        });

        test('cursor between self-closing tags', () => {
            testJsx('<div><br />⌘<hr /></div>', true);
        });

        test('self-closing component', () => {
            testJsx('<div><MyComponent prop="val" />⌘</div>', true);
        });
    });

    suite('React Fragments', () => {
        test('cursor inside fragment', () => {
            testJsx('<>⌘</>', true);
        });

        test('cursor in fragment with content', () => {
            testJsx('<>hello ⌘world</>', true);
        });

        test('cursor in nested element inside fragment', () => {
            testJsx('<><div>⌘</div></>', true);
        });
    });

    suite('TypeScript generics (should NOT be detected as tags)', () => {
        test('useState generic', () => {
            testJsx('const [state] = useState<string>⌘();', false);
        });

        test('Array generic', () => {
            testJsx('const arr: Array<number>⌘ = [];', false);
        });

        test('function generic', () => {
            testJsx('function foo<T>⌘(x: T) { return x; }', false);
        });

        test('generic after identifier', () => {
            testJsx('const x = getValue<User>⌘();', false);
        });

        test('Promise generic', () => {
            testJsx('async function foo(): Promise<void>⌘ {}', false);
        });

        test('Map generic', () => {
            testJsx('const map = new Map<string, number>⌘();', false);
        });
    });

    suite('Comparison operators (should NOT be detected as tags)', () => {
        test('less than comparison', () => {
            testJsx('if (a < b)⌘ {}', false);
        });

        test('greater than comparison', () => {
            testJsx('if (a > b)⌘ {}', false);
        });

        test('less than or equal', () => {
            testJsx('if (a <= b)⌘ {}', false);
        });

        test('comparison in expression', () => {
            testJsx('const result = x < y⌘ ? 1 : 2;', false);
        });
    });

    suite('JSX after keywords', () => {
        test('JSX after return', () => {
            testJsx('return <div>⌘</div>;', true);
        });

        test('JSX after arrow function', () => {
            testJsx('const Comp = () => <div>⌘</div>;', true);
        });

        test('JSX in variable assignment', () => {
            testJsx('const element = <div>⌘</div>;', true);
        });

        test('JSX after opening paren', () => {
            testJsx('render(<div>⌘</div>);', true);
        });

        test('JSX after comma', () => {
            testJsx('[<span>a</span>, <span>⌘</span>]', true);
        });

        test('JSX in ternary', () => {
            testJsx('condition ? <div>⌘</div> : null', true);
        });

        test('JSX after &&', () => {
            testJsx('condition && <div>⌘</div>', true);
        });

        test('JSX after ||', () => {
            testJsx('fallback || <div>⌘</div>', true);
        });
    });

    suite('Strings and template literals', () => {
        test('cursor in string (not JSX)', () => {
            testJsx('const s = "<div>⌘</div>";', false);
        });

        test('cursor in template literal', () => {
            testJsx('const s = `<div>⌘</div>`;', false);
        });

        test('JSX with string attribute, cursor in content', () => {
            testJsx('<div data-text="<span>">⌘</div>', true);
        });

        test('string containing < > in JS code', () => {
            testJsx('const x = "a < b > c";⌘', false);
        });
    });

    suite('Complex real-world examples', () => {
        test('component with multiple props and content', () => {
            testJsx('<Button onClick={handleClick} disabled={isLoading} className="btn">⌘Click me</Button>', true);
        });

        test('list rendering with map', () => {
            testJsx('<ul>{items.map(item => <li key={item.id}>⌘{item.name}</li>)}</ul>', false);
        });

        test('conditional rendering', () => {
            testJsx('<div>{isLoggedIn ? <UserPanel>⌘</UserPanel> : <LoginForm />}</div>', false);
        });

        test('component with spread props', () => {
            testJsx('<Input {...props} value={value}>⌘</Input>', true);
        });

        test('styled component', () => {
            testJsx('<StyledDiv $primary={true} $size="large">⌘content</StyledDiv>', true);
        });

        test('event handler with arrow function', () => {
            testJsx('<button onClick={() => console.log("clicked")}>⌘Click</button>', true);
        });

        test('nested ternary in JSX', () => {
            testJsx('<div>{a ? <A>⌘</A> : b ? <B /> : <C />}</div>', false);
        });
    });

    suite('Edge cases', () => {
        test('empty string', () => {
            testJsx('⌘', false);
        });

        test('just JS code', () => {
            testJsx('const x = 1;⌘', false);
        });

        test('cursor at very start before tag', () => {
            testJsx('⌘<div></div>', false);
        });

        test('cursor at very end after tag', () => {
            testJsx('<div></div>⌘', false);
        });

        test('multiple root elements', () => {
            testJsx('<div></div><span>⌘</span>', true);
        });

        test('whitespace in content', () => {
            testJsx('<div>   ⌘   </div>', true);
        });

        test('newlines in content', () => {
            testJsx('<div>\n  ⌘  \n</div>', true);
        });

        test('comment-like content', () => {
            testJsx('<div><!-- ⌘not a comment --></div>', true);
        });

        test('special characters in content', () => {
            testJsx('<div>&nbsp;⌘&amp;</div>', true);
        });
    });

    suite('Component names', () => {
        test('PascalCase component', () => {
            testJsx('<MyComponent>⌘</MyComponent>', true);
        });

        test('namespaced component', () => {
            testJsx('<UI.Button>⌘</UI.Button>', true);
        });

        test('lowercase HTML tag', () => {
            testJsx('<div>⌘</div>', true);
        });

        test('SVG element', () => {
            testJsx('<svg><path d="M0 0" />⌘</svg>', true);
        });
    });
});

suite('HTML Cursor Position Detection', () => {
    
    suite('Basic tag content', () => {
        test('cursor between simple tags', () => {
            testHtml('<div>⌘</div>', true);
        });

        test('cursor in text content', () => {
            testHtml('<div>hello ⌘world</div>', true);
        });

        test('cursor in empty content', () => {
            testHtml('<span>⌘</span>', true);
        });
    });

    suite('Inside tag definition (should be false)', () => {
        test('cursor in tag name', () => {
            testHtml('<di⌘v>', false);
        });

        test('cursor in opening tag with attributes', () => {
            testHtml('<div ⌘class="test">', false);
        });

        test('cursor in attribute value', () => {
            testHtml('<div class="⌘test">', false);
        });

        test('cursor in closing tag', () => {
            testHtml('<div></di⌘v>', false);
        });
    });

    suite('Nested tags', () => {
        test('cursor in nested tag content', () => {
            testHtml('<div><span>⌘</span></div>', true);
        });

        test('cursor in deeply nested content', () => {
            testHtml('<div><ul><li>⌘text</li></ul></div>', true);
        });

        test('cursor between sibling tags', () => {
            testHtml('<div><span></span>⌘<span></span></div>', true);
        });
    });

    suite('Self-closing tags', () => {
        test('cursor inside self-closing tag', () => {
            testHtml('<input ⌘/>', false);
        });

        test('cursor after self-closing tag inside parent', () => {
            testHtml('<div><br />⌘</div>', true);
        });

        test('void elements', () => {
            testHtml('<div><img src="test.jpg">⌘</div>', true);
        });
    });

    suite('HTML-specific elements', () => {
        test('DOCTYPE', () => {
            testHtml('<!DOCTYPE html><html>⌘</html>', true);
        });

        test('comment', () => {
            testHtml('<div><!-- comment -->⌘</div>', true);
        });

        test('script tag content', () => {
            testHtml('<script>const x = 1;⌘</script>', true);
        });

        test('style tag content', () => {
            testHtml('<style>.class { color: red; }⌘</style>', true);
        });

        test('after script tag', () => {
            testHtml('<div><script></script>⌘</div>', true);
        });
    });

    suite('Complex HTML structures', () => {
        test('table structure', () => {
            testHtml('<table><tr><td>⌘data</td></tr></table>', true);
        });

        test('form elements', () => {
            testHtml('<form><label>Name:⌘</label><input type="text"></form>', true);
        });

        test('list structure', () => {
            testHtml('<ul><li>item 1</li><li>⌘item 2</li></ul>', true);
        });

        test('semantic HTML', () => {
            testHtml('<article><header>⌘Title</header><section>Content</section></article>', true);
        });
    });

    suite('Attributes with special characters', () => {
        test('attribute with angle brackets in value', () => {
            testHtml('<div data-template="<span>">⌘</div>', true);
        });

        test('multiple attributes', () => {
            testHtml('<input type="text" value="test" placeholder="Enter..." />⌘<span>after</span>', true);
        });

        test('attribute with quotes inside', () => {
            testHtml('<div data-json=\'{"key": "value"}\'>⌘</div>', true);
        });
    });

    suite('Edge cases', () => {
        test('empty document', () => {
            testHtml('⌘', false);
        });

        test('cursor before first tag', () => {
            testHtml('⌘<div></div>', false);
        });

        test('cursor after document', () => {
            testHtml('<div></div>⌘', true);
        });

        test('whitespace between tags', () => {
            testHtml('<div>   ⌘   </div>', true);
        });

        test('newlines and indentation', () => {
            testHtml('<div>\n    <span>\n        ⌘content\n    </span>\n</div>', true);
        });
    });
});

suite('Regression tests', () => {
    test('TSX with useState hook', () => {
        const code = `
function Component() {
    const [count, setCount] = useState<number>(0);
    return <div>⌘Count: {count}</div>;
}`;
        testJsx(code, true);
    });

    test('TSX with generic component', () => {
        const code = `
const List = <T extends object>({ items }: { items: T[] }) => {
    return <ul>{items.map(i => <li>⌘{String(i)}</li>)}</ul>;
};`;
        testJsx(code, false);
    });

    test('complex comparison should not be tag', () => {
        const code = `
if (array.length > 0 && value < 100) {
    ⌘return null;
}`;
        testJsx(code, false);
    });

    test('TSX with async/await', () => {
        const code = `
async function fetchData(): Promise<void> {
    const data = await fetch(url);
    return <div>⌘{data}</div>;
}`;
        testJsx(code, true);
    });

    test('TSX with type assertion', () => {
        const code = `
const element = document.getElementById('app') as HTMLDivElement;
return <div>⌘Hello</div>;`;
        testJsx(code, true);
    });

    test('deeply nested JSX expressions', () => {
        const code = `<div>{a && (b || <span>{c ? <em>⌘</em> : null}</span>)}</div>`;
        testJsx(code, false);
    });

    test('JSX after logical OR operator', () => {
        testJsx('const x = null || <div>⌘</div>;', true);
    });

    test('JSX after logical AND operator', () => {
        testJsx('const x = true && <div>⌘</div>;', true);
    });

    test('multiple || operators before JSX', () => {
        testJsx('const x = a || b || <div>⌘</div>;', true);
    });

    test('bitwise OR should not trigger JSX', () => {
        testJsx('const x = a | b;⌘', false);
    });
});
