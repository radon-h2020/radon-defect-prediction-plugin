"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const AXIOS = require('axios').default;
const extract = require('extract-zip');
function classify(content) {
    return __awaiter(this, void 0, void 0, function* () {
        return AXIOS.post('https://radon.giovanni.pink/api/classification/classify', content, {
            headers: { 'Content-Type': 'text/plain' }
        })
            .then(function (response) {
            let json_data = response.data.metrics;
            json_data['defective'] = response.data.defective.toString().toUpperCase();
            return json_data;
        })
            .catch(function (error) {
            return undefined;
        });
    });
}
function walk(dir, filelist) {
    /*
    Return all the yaml and tosca files in the folder
    */
    let files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function (file) {
        if (fs.statSync(path.join(dir, file)).isDirectory())
            filelist = walk(path.join(dir, file), filelist);
        else if (file.split('.').pop() == 'yml' || file.split('.').pop() == 'tosca')
            filelist.push(path.join(dir, file));
    });
    return filelist;
}
;
function activate(context) {
    let disposable = vscode.commands.registerCommand('radon-defect-prediction-plugin.run', (uri) => {
        vscode.window.showInformationMessage('Detection started. Please wait for the results...');
        // Create and show panel
        const panel = vscode.window.createWebviewPanel('radon-defect-predictor', 'Receptor', vscode.ViewColumn.Two, {
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'html'))],
            enableScripts: true
        });
        const filePath = uri.path;
        const fileExtension = filePath.split('.').pop();
        if (fileExtension == 'csar') {
            const unzipped_dir = filePath.replace('.csar', '');
            extract(filePath, { dir: unzipped_dir }).then(function (err) {
                let files = walk(unzipped_dir, []);
                files.forEach(function (file) {
                    const content = fs.readFileSync(file, 'utf-8');
                    classify(content.toString()).then(function (result) {
                        if (result) {
                            result['file'] = file.replace(filePath.replace('.csar', ''), '');
                            panel.webview.html = getWebviewContent(result);
                        }
                        else {
                            vscode.window.showErrorMessage('Cannot read the file. Make sure it is a valid not-empty YAML-based Ansible file');
                        }
                    });
                });
                // delete folder
                fs.rmdir(unzipped_dir, { recursive: true }, (err) => {
                    if (err)
                        throw err;
                });
            });
            return;
        }
        else {
            const fileName = path.basename(filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            classify(content.toString()).then(function (result) {
                if (result) {
                    result['file'] = fileName;
                    panel.webview.html = getWebviewContent(result);
                }
                else {
                    vscode.window.showErrorMessage('Cannot read the file. Make sure it is a valid not-empty YAML-based Ansible file');
                }
            });
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
var accordion = '';
var viewContent = `
<!doctype html>
<html lang="en">
<head>
	<!-- Required meta tags -->
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
	<title>AnsibleMetrics</title>

	<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css" integrity="sha384-MCw98/SFnGE8fJT3GXwEOngsV7Zt27NXFoaoApmYm81iuXoPkFOJwJ8ERdknLPMO" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
	<link rel="stylesheet" href="https://unpkg.com/bootstrap-table@1.16.0/dist/bootstrap-table.min.css">
</head>
<body>

	<div class="accordion" id="accordion">
		{{accordion}}
	</div>

	<!-- Footer -->
	<footer class="py-5 bg-dark">
		<div class="container">
		<p class="m-0 text-center">
			<i class="fa fa-github" style="color: white;"></i>
			<a href="https://github.com/radon-h2020/radon-defect-prediction-plugin	" class="m-0 text-center text-white">Github</a>
		</p>
		</div>
		<div class="container">
		<p class="m-0 text-center text-white">
		<i class="fa fa-book"></i>
		<a href="https://radon-h2020.github.io/radon-defect-prediction-api/" class="m-0 text-center text-white">Documentation</a>
		</p>
		</div>
		<!-- /.container -->
	</footer> 


	<script src="https://code.jquery.com/jquery-3.3.1.slim.min.js" integrity="sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo" crossorigin="anonymous"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.3/umd/popper.min.js" integrity="sha384-ZMP7rVo3mIykV+2+9J3UJ46jBk0WLaUAdn689aCwoqbBJiSnjAK/l8WvCWPIPm49" crossorigin="anonymous"></script>
	<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/js/bootstrap.min.js" integrity="sha384-ChfqqxuZUCnJSK3+MXmPNIyE6ZbWh2IMqE241rYiqJxyMiZ6OW/JmZQ5stwEULTy" crossorigin="anonymous"></script>

	<script src="https://unpkg.com/bootstrap-table@1.16.0/dist/bootstrap-table.min.js"></script>

</body>
</html>`;
function getWebviewContent(data) {
    let tbody = '';
    let title = '';
    for (let [key, value] of Object.entries(data)) {
        let new_key = key.toLowerCase()
            .split('_')
            .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
            .join(' ');
        if (value != 0)
            tbody += generateHtmlTableRow(new_key, value);
        if (key == 'file')
            title = value;
    }
    let id = title.replace(/[_\.\/]/g, '');
    accordion += `
		<div class="card">
			<button class="btn btn-link text-left" type="button" data-toggle="collapse" data-target="#collapse-${id}" aria-expanded="false" aria-controls="collapse-${id}">
				<div class="card-header">
					<h5 class="mb-0">${title}</h5>
				</div>
			</button>
			<div id="collapse-${id}" class="collapse" aria-labelledby="heading-${id}" data-parent="#accordion">
				<div class="card-body">
					<table data-toggle="table">
						<thead>
							<tr>
							<th>Metric</th>
							<th>Value</th>
							</tr>
						</thead>
						<tbody>
							${tbody}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	`;
    return viewContent.replace('{{accordion}}', accordion);
    return `
	<!doctype html>
	<html lang="en">
	<head>
		<!-- Required meta tags -->
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
		<title>AnsibleMetrics</title>

		<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.6.3/css/all.css" integrity="sha384-UHRtZLI+pbxtHCWp1t77Bi1L4ZtiqrqD80Kn4Z8NTSRyMA2Fd33n5dQ8lWUE00s/" crossorigin="anonymous">
		<link rel="stylesheet" href="https://unpkg.com/bootstrap-table@1.16.0/dist/bootstrap-table.min.css">
	</head>
	<body>
		<table data-toggle="table">
		<thead>
			<tr>
			<th>Metric</th>
			<th>Value</th>
			</tr>
		</thead>
		<tbody>
		${tbody}
		</tbody>
		</table>

		<!-- Footer -->
		<footer class="py-5 bg-dark">
			<div class="container">
			<p class="m-0 text-center">
				<i class="fab fa-github" style="color: white;"></i>
				<a href="https://github.com/radon-h2020/radon-defect-prediction-plugin	" class="m-0 text-center text-white">Github</a>
			</p>
			</div>
			<div class="container">
			<p class="m-0 text-center text-white">
			<i class="fas fa-book"></i>
			<a href="https://radon-h2020.github.io/radon-defect-prediction-api/" class="m-0 text-center text-white">Documentation</a>
			</p>
			</div>
			<!-- /.container -->
		</footer> 
  

		<script src="https://code.jquery.com/jquery-3.3.1.min.js" integrity="sha256-FgpCb/KJQlLNfOu91ta32o/NMZxltwRo8QtmkMRdAu8=" crossorigin="anonymous"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
		<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
		<script src="https://unpkg.com/bootstrap-table@1.16.0/dist/bootstrap-table.min.js"></script>
	</body>
	</html>`;
}
function generateHtmlTableRow(name, value) {
    // generate a HTML table row as follows: <tr><td>name</td><td>value</td></tr>
    return `<tr><td>${name}</td><td>${value}</td></tr>`;
}
//# sourceMappingURL=extension.js.map