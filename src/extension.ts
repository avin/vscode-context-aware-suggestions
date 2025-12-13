import * as vscode from 'vscode';

// Supported language IDs
const SUPPORTED_LANGUAGES = new Set([
    'javascriptreact',
    'typescriptreact',
    'javascript',
    'typescript',
    'html',
    'xml',
    'xhtml',
    'svg'
]);

// Languages that can contain JSX
const JSX_LANGUAGES = new Set([
    'javascriptreact',
    'typescriptreact',
    'javascript',
    'typescript'
]);

let lastState: boolean | null = null;
let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
    // On activation, clean up any existing quickSuggestions settings
    cleanupSettings().catch(console.error);

    // Subscribe to cursor position changes
    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
        debounce(handleSelectionChange, 50)
    );
    disposables.push(selectionDisposable);

    // Subscribe to active editor changes
    const editorDisposable = vscode.window.onDidChangeActiveTextEditor(handleEditorChange);
    disposables.push(editorDisposable);

    // Subscribe to document close events
    const closeDisposable = vscode.workspace.onDidCloseTextDocument(handleDocumentClose);
    disposables.push(closeDisposable);

    context.subscriptions.push(...disposables);

    // Handle initial state if there's an active editor
    if (vscode.window.activeTextEditor) {
        handleSelectionChange({
            textEditor: vscode.window.activeTextEditor,
            selections: vscode.window.activeTextEditor.selections,
            kind: undefined
        });
    }
}

export function deactivate() {
    // Clean up settings on deactivation
    cleanupSettings().catch(console.error);
    lastState = null;
}

function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func(...args), wait);
    };
}

function handleEditorChange(editor: vscode.TextEditor | undefined) {
    if (!editor || !isSupportedLanguage(editor.document.languageId)) {
        // Switching away from supported file - cleanup
        if (lastState !== null) {
            cleanupSettings().catch(console.error);
            lastState = null;
        }
        return;
    }

    // Trigger check for new editor
    handleSelectionChange({
        textEditor: editor,
        selections: editor.selections,
        kind: undefined
    });
}

function handleDocumentClose(document: vscode.TextDocument) {
    // If closing a supported document, cleanup settings
    if (isSupportedLanguage(document.languageId)) {
        const activeEditor = vscode.window.activeTextEditor;
        // Only cleanup if the active editor is not a supported file
        if (!activeEditor || !isSupportedLanguage(activeEditor.document.languageId)) {
            cleanupSettings().catch(console.error);
            lastState = null;
        }
    }
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    const editor = event.textEditor;
    const document = editor.document;

    if (!isSupportedLanguage(document.languageId)) {
        return;
    }

    const position = editor.selection.active;
    const isBetweenTags = checkIfBetweenTags(document, position);

    // Only update settings if state changed
    if (lastState !== isBetweenTags) {
        lastState = isBetweenTags;
        if (isBetweenTags) {
            disableQuickSuggestions().catch(console.error);
        } else {
            enableQuickSuggestions().catch(console.error);
        }
    }
}

function isSupportedLanguage(languageId: string): boolean {
    return SUPPORTED_LANGUAGES.has(languageId);
}

/**
 * Check if cursor is positioned between tags (in text content area)
 * Returns true if between tags, false if inside a tag, in JS code, or in attributes
 */
function checkIfBetweenTags(document: vscode.TextDocument, position: vscode.Position): boolean {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const languageId = document.languageId;
    const isJsxLanguage = JSX_LANGUAGES.has(languageId);

    // For JSX languages, use JSX-aware parsing
    if (isJsxLanguage) {
        return isInJsxTextContent(text, offset);
    }

    // For HTML/XML/SVG, use simpler tag-based parsing
    return isInHtmlTextContent(text, offset);
}

/**
 * Check if a < at position i is likely a JSX/HTML tag start (not a comparison or generic)
 */
function isLikelyTagStart(text: string, i: number): boolean {
    const nextChar = text[i + 1];
    if (!nextChar) {
        return false;
    }
    
    // Must start with letter (tag name), / (closing tag), or > (fragment <>)
    if (!/[A-Za-z\/>/]/.test(nextChar)) {
        return false;
    }
    
    // Look at what's before the <
    // If preceded by identifier char or ), it's likely a comparison: `a < b`, `foo() < bar`
    let j = i - 1;
    while (j >= 0 && /\s/.test(text[j])) {
        j--; // skip whitespace
    }
    
    if (j >= 0) {
        const prevChar = text[j];
        
        // Check for operators that can precede JSX: ||, &&, etc.
        if (prevChar === '|' || prevChar === '&') {
            return true;
        }
        
        // If previous char is alphanumeric, ), or ], it's likely comparison
        if (/[A-Za-z0-9_)\]]/.test(prevChar)) {
            // Exception: keywords that can precede JSX
            const beforePrev = text.substring(Math.max(0, j - 10), j + 1);
            if (/\b(return|=>|=|\(|,|:|\?|&&|\|\||!)\s*$/.test(beforePrev)) {
                return true;
            }
            return false;
        }
    }
    
    return true;
}

/**
 * Check if > at position i is likely a JSX/HTML tag end (not a comparison or generic)
 */
function isLikelyTagEnd(text: string, i: number, tagDepth: number): boolean {
    // If we're tracking tags and have depth, this is likely a tag end
    if (tagDepth > 0) {
        return true;
    }
    
    // Look at what follows the >
    const nextChar = text[i + 1];
    
    // After tag close usually comes: whitespace, newline, text content, another tag, or {
    // After comparison/generic usually comes: identifier, (, number
    if (nextChar && /[A-Za-z0-9_\(]/.test(nextChar)) {
        // Check if this looks like it's ending a tag
        // Look back for tag pattern
        let j = i - 1;
        let foundSlash = false;
        
        // Check for self-closing /> or closing tag </name>
        if (text[i - 1] === '/') {
            foundSlash = true;
            j = i - 2;
        }
        
        // Skip backwards through possible tag content
        while (j >= 0 && /[A-Za-z0-9_\-="'\s:]/.test(text[j])) {
            j--;
        }
        
        // Should find < or </
        if (j >= 0 && text[j] === '<') {
            return true;
        }
        if (j >= 1 && text[j - 1] === '<' && text[j] === '/') {
            return true;
        }
        
        if (!foundSlash) {
            return false;
        }
    }
    
    return true;
}

/**
 * Parse JSX/TSX and determine if cursor is in text content between tags
 * @exported for testing
 */
export function isInJsxTextContent(text: string, offset: number): boolean {
    let inString = false;
    let stringChar = '';
    let inTemplate = false;
    let templateDepth = 0;
    let braceDepth = 0;          // {} depth in JS context
    let jsxBraceDepth = 0;       // {} depth in JSX content (expressions)
    let jsxTagDepth = 0;         // JSX tag nesting depth
    let inJsxTag = false;        // Inside a JSX tag definition <tag ...>
    let lastJsxTagClose = -1;    // Position of last > that closed a JSX tag
    let inJsxContent = false;    // Are we in JSX content area (between tags)?
    
    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = text[i + 1] || '';
        
        // Handle escape sequences
        if ((inString || inTemplate) && prevChar === '\\') {
            continue;
        }
        
        // Handle strings
        if (!inTemplate && !inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar) {
            inString = false;
            continue;
        }
        if (inString) {
            continue;
        }
        
        // Handle template literals
        if (!inTemplate && char === '`') {
            inTemplate = true;
            templateDepth = 1;
            continue;
        }
        if (inTemplate) {
            if (char === '`') {
                inTemplate = false;
                templateDepth = 0;
            } else if (char === '$' && nextChar === '{') {
                templateDepth++;
            } else if (char === '}' && templateDepth > 1) {
                templateDepth--;
            }
            continue;
        }
        
        // Track braces in JS context (not in JSX content)
        if (!inJsxContent && !inJsxTag) {
            if (char === '{') {
                braceDepth++;
            } else if (char === '}') {
                braceDepth--;
            }
        }
        
        // Track JSX expression braces { } when in JSX content
        if (inJsxContent && !inJsxTag) {
            if (char === '{') {
                jsxBraceDepth++;
            } else if (char === '}' && jsxBraceDepth > 0) {
                jsxBraceDepth--;
            }
        }
        
        // Don't process < > inside JSX expressions
        if (jsxBraceDepth > 0) {
            continue;
        }
        
        // Handle < - potential tag start
        if (char === '<' && isLikelyTagStart(text, i)) {
            if (nextChar === '/') {
                // Closing tag </tag>
                inJsxTag = true;
            } else if (nextChar === '>') {
                // Fragment <>
                jsxTagDepth++;
                inJsxContent = true;
                i++; // skip >
                lastJsxTagClose = i;
            } else {
                // Opening tag <tag or <Component
                inJsxTag = true;
            }
            continue;
        }
        
        // Handle > - potential tag end
        if (char === '>' && inJsxTag) {
            inJsxTag = false;
            lastJsxTagClose = i;
            
            // Check if it was self-closing /> or closing tag
            if (prevChar === '/') {
                // Self-closing tag />
                if (jsxTagDepth === 0) {
                    // Single self-closing tag, we exit JSX
                    inJsxContent = false;
                }
            } else {
                // Check if this was a closing tag by looking back for </
                let j = i - 1;
                while (j >= 0 && /[A-Za-z0-9_.\-]/.test(text[j])) {
                    j--;
                }
                while (j >= 0 && /\s/.test(text[j])) {
                    j--;
                }
                
                if (j >= 0 && text[j] === '/' && j > 0 && text[j - 1] === '<') {
                    // This was a closing tag </tag>
                    jsxTagDepth--;
                    if (jsxTagDepth <= 0) {
                        jsxTagDepth = 0;
                        inJsxContent = false;
                    }
                } else {
                    // This was an opening tag <tag>
                    jsxTagDepth++;
                    inJsxContent = true;
                }
            }
            continue;
        }
        
        // Handle fragment closing </>
        if (char === '<' && nextChar === '/' && text[i + 2] === '>') {
            jsxTagDepth--;
            if (jsxTagDepth <= 0) {
                jsxTagDepth = 0;
                inJsxContent = false;
            }
            i += 2; // skip />
            lastJsxTagClose = i;
            continue;
        }
    }
    
    // We're "between tags" if:
    // 1. We're in JSX content area
    // 2. We're not inside a JSX expression { }
    // 3. We're not inside a tag definition
    return inJsxContent && jsxBraceDepth === 0 && !inJsxTag;
}

/**
 * Parse HTML/XML and determine if cursor is in text content between tags
 * @exported for testing
 */
export function isInHtmlTextContent(text: string, offset: number): boolean {
    let inTag = false;
    let inString = false;
    let stringChar = '';
    let tagDepth = 0;
    let lastTagClose = -1;
    
    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = text[i + 1] || '';
        
        // Handle strings inside tags (attribute values)
        if (inTag && !inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            continue;
        }
        if (inString) {
            continue;
        }
        
        // Handle tag start
        if (char === '<' && /[A-Za-z\/!?]/.test(nextChar)) {
            inTag = true;
            
            // Check for closing tag
            if (nextChar === '/') {
                // Will decrease depth when > is found
            }
            continue;
        }
        
        // Handle tag end
        if (char === '>' && inTag) {
            inTag = false;
            lastTagClose = i;
            
            // Check if self-closing or closing tag
            if (prevChar === '/') {
                // Self-closing />
                // depth stays same
            } else {
                // Look back to determine if opening or closing
                let j = i - 1;
                while (j >= 0 && /[A-Za-z0-9_\-\s="']/.test(text[j])) {
                    j--;
                }
                
                if (j >= 0 && text[j] === '/') {
                    // Closing tag </tag>
                    tagDepth--;
                } else if (j >= 0 && text[j] === '<') {
                    // Opening tag <tag>
                    tagDepth++;
                }
            }
            continue;
        }
    }
    
    // We're between tags if:
    // 1. We're not inside a tag
    // 2. We have open tags (depth > 0) OR we just closed a tag
    return !inTag && (tagDepth > 0 || lastTagClose >= 0);
}

/**
 * Disable quick suggestions by adding setting to .vscode/settings.json
 * Uses VS Code API to properly preserve other settings and comments
 */
async function disableQuickSuggestions(): Promise<void> {
    const config = vscode.workspace.getConfiguration('editor');
    
    try {
        await config.update('quickSuggestions', {
            comments: false,
            strings: false,
            other: false
        }, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
        console.error('Error disabling quickSuggestions:', error);
    }
}

/**
 * Enable quick suggestions by removing setting from .vscode/settings.json
 * Uses VS Code API to properly preserve other settings and comments
 */
async function enableQuickSuggestions(): Promise<void> {
    const config = vscode.workspace.getConfiguration('editor');
    
    try {
        // Setting to undefined removes the key from workspace settings
        await config.update('quickSuggestions', undefined, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
        console.error('Error enabling quickSuggestions:', error);
    }
}

/**
 * Clean up quick suggestions setting
 */
async function cleanupSettings(): Promise<void> {
    await enableQuickSuggestions();
    lastState = null;
}
