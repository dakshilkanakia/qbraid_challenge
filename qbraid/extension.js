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
            }
            #apiKeySection, #chatSection {
                margin-bottom: 20px;
            }
            #chatSection {
                display: none;
            }
            input, select {
                margin: 5px 0;
                padding: 5px;
                width: 300px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
            }
            button {
                padding: 5px 10px;
                margin-left: 5px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                cursor: pointer;
            }
            #chatDisplay {
                height: 400px;
                overflow-y: auto;
                border: 1px solid var(--vscode-input-border);
                margin: 10px 0;
                padding: 10px;
                background: var(--vscode-input-background);
            }
            .message {
                margin: 10px 0;
                padding: 8px;
                border-radius: 4px;
            }
            .user-message {
                background: var(--vscode-editor-background);
            }
            .assistant-message {
                background: var(--vscode-editor-selectionBackground);
            }
            .error {
                color: var(--vscode-errorForeground);
                background: var(--vscode-inputValidation-errorBackground);
                padding: 8px;
                margin: 5px 0;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div id="apiKeySection">
            <label for="apiKey">API Key:</label>
            <input type="text" id="apiKey" placeholder="Enter your 30-character API key" />
            <div id="apiKeyStatus"></div>
        </div>
        
        <div id="chatSection">
            <div style="display: flex; align-items: center;">
                <select id="modelSelect"></select>
                <input type="text" id="promptInput" placeholder="Enter your prompt..." style="flex-grow: 1; margin: 0 10px;" />
                <button onclick="sendPrompt()">Send</button>
            </div>
            <div id="chatDisplay"></div>
        </div>

        <script>
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

function deactivate() {
    if (currentPanel) {
        currentPanel.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};