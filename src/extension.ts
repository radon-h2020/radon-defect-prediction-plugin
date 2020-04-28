// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { readFileSync } from 'fs';

const AXIOS = require('axios').default;
const URL = 'http://localhost:5000/api/classification/classify';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {


	let disposable = vscode.commands.registerCommand('radon-defect-prediction-plugin.run', () => {
		
		if (vscode.window.activeTextEditor) {
			const currentDocument = vscode.window.activeTextEditor.document
			const content = readFileSync(currentDocument.uri.path, 'utf-8');
			
			AXIOS.post(URL, content.toString(), {
				headers: {
					'Content-Type': 'text/plain',
				}
			})
			.then(function (response: any) {
				if(response.data.defective)
					vscode.window.showWarningMessage(`ALT! ${currentDocument.uri.path} might contains defects!`);
				else
					vscode.window.showInformationMessage(currentDocument.uri.path + ' is defect-free!');
			})
			.catch(function (error: any) {
				vscode.window.showErrorMessage('Cannot read the file');
			});
		}

	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
