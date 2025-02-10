const vscode = require('vscode');
const axios = require('axios');

/**
 * @type {vscode.WebviewPanel | undefined}
 */
let currentPanel = undefined;

function activate(context) {
    console.log('qBraid Chat extension is now active');

    let disposable = vscode.commands.registerCommand('qbraid-chat.openChat', () => {
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
        } else {
            createWebviewPanel(context);
        }
    });

    context.subscriptions.push(disposable);
}

function createWebviewPanel(context) {
    // Create and show panel
    currentPanel = vscode.window.createWebviewPanel(
        'qbraidChat',
        'qBraid Chat',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(context.extensionPath)]
        }
    );

    // Set initial content
    try {
        const webviewContent = getWebviewContent(currentPanel.webview);
        currentPanel.webview.html = webviewContent;
    } catch (error) {
        console.error('Error setting webview content:', error);
        vscode.window.showErrorMessage('Failed to create webview: ' + error.message);
    }

    // Handle messages
    currentPanel.webview.onDidReceiveMessage(
        async message => {
            if (!currentPanel) return;

            switch (message.command) {
                case 'validateApiKey':
                    await handleApiKeyValidation(message.apiKey, currentPanel);
                    break;
                case 'sendChat':
                    await handleChatRequest(message.prompt, currentPanel);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // Reset when disposed
    currentPanel.onDidDispose(
        () => {
            currentPanel = undefined;
        },
        null,
        context.subscriptions
    );
}


async function handleApiKeyValidation(apiKey, panel) {
    if (!panel) return;

    try {
        const response = await axios.get('https://api.qbraid.com/api/chat/models', {
            headers: { 'api-key': apiKey }
        });

        if (response.status === 200) {
            const models = response.data.map(model => model.model);
            panel.webview.postMessage({
                command: 'apiKeyValidated',
                models: models
            });
            await vscode.workspace.getConfiguration().update('qbraidChat.apiKey', apiKey, true);
        }
    } catch (error) {
        if (panel) {
            panel.webview.postMessage({
                command: 'error',
                message: error.response?.data || 'Failed to validate API key'
            });
        }
    }
}

async function handleChatRequest(prompt, panel) {
    if (!panel) return;

    try {
        const apiKey = vscode.workspace.getConfiguration().get('qbraidChat.apiKey');
        if (!apiKey) {
            panel.webview.postMessage({
                command: 'error',
                message: 'API key not found. Please enter your API key.'
            });
            return;
        }

        const response = await axios.post('https://api.qbraid.com/api/chat', 
            { prompt },
            { headers: { 'api-key': apiKey, 'Content-Type': 'application/json' } }
        );

        if (response.status === 200 && panel) {
            panel.webview.postMessage({
                command: 'chatResponse',
                content: response.data.content
            });
        }
    } catch (error) {
        if (panel) {
            panel.webview.postMessage({
                command: 'error',
                message: error.response?.data || 'Failed to get chat response'
            });
        }
    }
}

function getWebviewContent(webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'none'; 
                     style-src 'unsafe-inline' ${webview.cspSource}; 
                     script-src 'unsafe-inline' ${webview.cspSource};
                     connect-src https://api.qbraid.com;">
        <title>qBraid Chat</title>
        <style>
            body {
                padding: 20px;
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                max-width: 1200px;
                margin: 0 auto;
                line-height: 1.5;
            }

            /* Container styles */
            .container {
                background: var(--vscode-editor-background);
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }

            /* Section styles */
            #apiKeySection, #chatSection {
                margin-bottom: 24px;
                padding: 16px;
                border-radius: 6px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
            }

            /* Form elements */
            .input-group {
                margin-bottom: 16px;
            }

            label {
                display: block;
                margin-bottom: 8px;
                color: var(--vscode-foreground);
                font-weight: 500;
            }

            input, select {
                width: 100%;
                padding: 8px 12px;
                margin: 4px 0;
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                font-size: 14px;
            }

            input:focus, select:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }

            /* Button styles */
            button {
                padding: 8px 16px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }

            button:hover {
                background: var(--vscode-button-hoverBackground);
            }

            /* Chat interface */
            .chat-container {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .input-container {
                display: flex;
                gap: 12px;
                align-items: center;
                padding: 12px;
                background: var(--vscode-editor-background);
                border-radius: 6px;
                border: 1px solid var(--vscode-input-border);
            }

            #modelSelect {
                width: 200px;
                flex-shrink: 0;
            }

            #promptInput {
                flex-grow: 1;
            }

            /* Chat display */
            #chatDisplay {
                height: 500px;
                overflow-y: auto;
                padding: 16px;
                border-radius: 6px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
            }

            /* Message styles */
            .message {
                margin: 12px 0;
                padding: 12px 16px;
                border-radius: 6px;
                max-width: 85%;
                position: relative;
            }

            .user-message {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                margin-left: auto;
            }

            .assistant-message {
                background: var(--vscode-editor-selectionBackground);
                margin-right: auto;
            }

            /* Error messages */
            .error {
                color: var(--vscode-errorForeground);
                background: var(--vscode-inputValidation-errorBackground);
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
                border-left: 4px solid var(--vscode-errorForeground);
            }

            /* Status messages */
            #apiKeyStatus {
                margin-top: 8px;
                padding: 8px;
                border-radius: 4px;
            }

            /* Scrollbar styling */
            ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }

            ::-webkit-scrollbar-track {
                background: var(--vscode-scrollbarSlider-background);
                border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb {
                background: var(--vscode-scrollbarSlider-hoverBackground);
                border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb:hover {
                background: var(--vscode-scrollbarSlider-activeBackground);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div id="apiKeySection">
                <div class="input-group">
                    <label for="apiKey">API Key</label>
                    <input type="text" id="apiKey" placeholder="Enter your 30-character API key" maxlength="30" />
                    <div id="apiKeyStatus"></div>
                </div>
            </div>
            
            <div id="chatSection">
                <div class="chat-container">
                    <div class="input-container">
                        <select id="modelSelect"></select>
                        <input type="text" id="promptInput" placeholder="Type your message here..." />
                        <button onclick="sendPrompt()">Send</button>
                    </div>
                    <div id="chatDisplay"></div>
                </div>
            </div>
        </div>

        <script>
            // JavaScript remains the same as in your current version
            const vscode = acquireVsCodeApi();
            
            document.getElementById('apiKey').addEventListener('input', (e) => {
                const key = e.target.value.trim();
                const statusDiv = document.getElementById('apiKeyStatus');
                
                if (key.length === 30 && /^[a-z0-9]+$/.test(key)) {
                    statusDiv.textContent = 'Validating API key...';
                    statusDiv.className = '';
                    vscode.postMessage({
                        command: 'validateApiKey',
                        apiKey: key
                    });
                } else {
                    statusDiv.textContent = 'API key must be 30 characters long and contain only lowercase letters and numbers';
                    statusDiv.className = 'error';
                }
            });

            function sendPrompt() {
                const prompt = document.getElementById('promptInput').value.trim();
                if (!prompt) return;

                appendMessage(prompt, 'user');
                vscode.postMessage({
                    command: 'sendChat',
                    prompt: prompt
                });
                document.getElementById('promptInput').value = '';
            }

            function appendMessage(message, type = 'user') {
                const chatDisplay = document.getElementById('chatDisplay');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (type === 'user' ? 'user-message' : 'assistant-message');
                messageDiv.textContent = (type === 'user' ? 'You: ' : 'Assistant: ') + message;
                chatDisplay.appendChild(messageDiv);
                chatDisplay.scrollTop = chatDisplay.scrollHeight;
            }

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'apiKeyValidated':
                        document.getElementById('apiKeySection').style.display = 'none';
                        document.getElementById('chatSection').style.display = 'block';
                        const select = document.getElementById('modelSelect');
                        select.innerHTML = message.models.map(model => '<option value="' + model + '">' + model + '</option>').join('');
                        break;
                    case 'chatResponse':
                        appendMessage(message.content, 'assistant');
                        break;
                    case 'error':
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'error';
                        errorDiv.textContent = message.message;
                        document.getElementById('chatDisplay').appendChild(errorDiv);
                        break;
                }
            });

            document.getElementById('promptInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendPrompt();
                }
            });
        </script>
    </body>
    </html>`;
}