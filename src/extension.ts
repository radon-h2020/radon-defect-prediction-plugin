import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const AXIOS = require('axios').default;
const extract = require('extract-zip')

const thresholds:any = {avg_task_size: {q1: 4.0, median: 6.0, q3: 10.0, outlier: 19.0}, lines_blank: {q1: 1.0, median: 2.0, q3: 6.0, outlier: 13.5}, lines_code: {q1: 7.0, median: 16.0, q3: 36.0, outlier: 79.5}, lines_comment: {q1: 0.0, median: 0.0, q3: 2.0, outlier: 5.0}, num_conditions: {q1: 0.0, median: 0.0, q3: 2.0, outlier: 5.0}, num_decisions: {q1: 0.0, median: 0.0, q3: 1.0, outlier: 2.5}, num_distinct_modules: {q1: 0.0, median: 1.0, q3: 4.0, outlier: 10.0}, num_external_modules: {q1: 0.0, median: 0.0, q3: 1.0, outlier: 2.5}, num_filters: {q1: 0.0, median: 0.0, q3: 1.0, outlier: 2.5}, num_keys: {q1: 6.0, median: 13.0, q3: 30.0, outlier: 66.0}, num_loops: {q1: 0.0, median: 0.0, q3: 1.0, outlier: 2.5}, num_parameters: {q1: 0.0, median: 0.0, q3: 6.0, outlier: 15.0}, num_tasks: {q1: 1.0, median: 2.0, q3: 4.0, outlier: 8.5}, num_tokens: {q1: 17.0, median: 46.0, q3: 116.0, outlier: 264.5}, num_unique_names: {q1: 1.0, median: 2.0, q3: 5.0, outlier: 11.0}, num_vars: {q1: 0.0, median: 0.0, q3: 1.0, outlier: 2.5}, text_entropy: {q1: 3.75, median: 4.78, q3: 5.5, outlier: 8.125}}
const metrics_description:any = {
	avg_task_size: "Average number of code lines in tasks: LinesCode(tasks)/NumTasks. Interpretation: the higher the more complex and the more challenging to maintain the blueprint.", 
	lines_blank: "Total number of empty lines.", 
	lines_code: "Total number of executable source code lines. Interpretation: the more the lines of code, the more complex and the more challenging to maintain the blueprint.", 
	lines_comment: "Total number of commented lines (i.e., starting with #).",
	num_conditions: "Total number of conditions, measured counting the occurrences of the following operators in 'when' statements: is, in, ==, !=, >, >=, <, <=. Interpretation: the more the conditions, the more complex and the more challenging to maintain the blueprint.", 
	num_decisions: "Total number of conditions, measured counting the occurrences of the following operators in 'when' statements:  and, or, not. Interpretation: the more the decisions, the more complex and the more challenging to maintain the blueprint.",
	num_deprecated_modules: "Count the occurrences of deprecated modules. Deprecated modules usage is discouraged as they are kept for backward compatibility only. Interpretation: the more the deprecated modules, the more difficult it is to maintain and evolve the code. In addition, the higher the likelihood to crash if the current system does not support retro-compatibility.", 
	num_distinct_modules: "Count the distinct modules in the script. Modules are reusable and standalone scripts called by tasks. They allow to change or get information about the state of the system and can be interpreted as a degree of responsibility of the blueprint. Therefore, a blueprint consisting of many distinct modules might be less self-contained and potentially affect the complexity and maintainability of the system, as it is responsible for executing many different tasks rather than a task several times with different options, for example, to ensure the presence of dependencies in the system. Interpretation: the more the distinct modules, the more challenging to maintain the blueprint.", 
	num_external_modules: "Count occurrences of modules created by the users and not maintained by the Ansible community. Interpretation: The more the external modules, the more challenging to maintain the blueprint and the higher the chance of system’s misbehavior",
	num_filters: "Count of '|' syntax occurrences inside {{*}} expressions. Filters transform the data of a template expression, for example, for formatting or rendering them. Although they allow for transforming data in a very compact way, filters can be concatenated to perform a sequence of different actions. Interpretation: the more the filters, the lower the readability and the more challenging to maintain the blueprint.",
	num_keys: "Count of keys in the dictionary representing a playbook or tasks",
	num_loops: "Count of 'loop' and 'with_*' syntax occurrences",
	num_parameters: "Count the total number of parameters, that is, the keys of the dictionary representing a module. In Ansible parameters (or arguments) describe the desired state of the system. Interpretation: the more the parameters, the more challenging to debug and test the blueprint.",
	num_tasks: "Measures the number of functions in a script. An Ansible task is equivalent to a method, as its goal is to execute a module with very specific arguments. Interpretation: the higher the number of tasks, the more complex and the more challenging to maintain the blueprint.",
	num_tokens: "Count the words separated by a blank space. Interpretation: the more the tokens, the more complex is the blueprint.",
	num_unique_names: "Number of plays and tasks with a unique name. Uniquely naming plays and tasks is a best practice to locate problematic tasks quickly. Duplicate names may lead to not deterministic or at least not obvious behaviors. Interpretation: the more the entities with unique names the higher the maintainability and readability of the blueprint.",
	num_vars: "Number of variables in the playbook.",
	text_entropy: "Mesures the complexity of a script based on its information content, analogous to the class entropy complexity. Interpretation: the higher the entropy, the more challenging to maintain the blueprint."
}


async function classify(content: string){

	return AXIOS.post('https://radon.giovanni.pink/api/classification/classify', content, {
		headers: { 'Content-Type': 'text/plain' }
	})
	.then(function (response: any) {
		let json_data = response.data.metrics
		json_data['defective'] = response.data.defective.toString().toUpperCase()
		return json_data
	})
	.catch(function (error: any) {
		return undefined
	})
}

function walk(dir: any, filelist: any) {
	/*
	Return all the yaml and tosca files in the folder 
	*/
	let files = fs.readdirSync(dir);
	filelist = filelist || [];
	
	files.forEach(function(file) {
	  if (fs.statSync(path.join(dir, file)).isDirectory()) 
	  	filelist = walk(path.join(dir, file), filelist);
	  else if (file.split('.').pop() == 'yml' || file.split('.').pop() == 'tosca')
	  	filelist.push(path.join(dir, file));
	});

	return filelist;
};


var accordion:string = ''

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('radon-defect-prediction-plugin.run', (uri: vscode.Uri) => {

		vscode.window.showInformationMessage('Detection started. Please wait for the results...')
		// Create and show panel
		const panel = vscode.window.createWebviewPanel(
			'radon-defect-predictor',
			'Receptor',
			vscode.ViewColumn.Two,
			{
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'html'))],
				enableScripts: true
			}
		);

		const filePath = uri.path;
		const fileExtension = filePath.split('.').pop()
		
		if(fileExtension == 'csar') {

			const unzipped_dir = filePath.replace('.csar', '')
			extract(filePath, {dir: unzipped_dir}).then(function (err: any) {
					
				let files = walk(unzipped_dir, [])
				
				files.forEach(function(file: string) {	
					const content = fs.readFileSync(file, 'utf-8');
					classify(content.toString()).then(function(result:any){
						if(result){
							result['file'] = file.replace(filePath.replace('.csar', ''), '')
							panel.webview.html = getWebviewContent(result)
						}else{
							vscode.window.showErrorMessage('Cannot read the file. Make sure it is a valid not-empty YAML-based Ansible file');
						}
					})
				})	

				// delete folder
				fs.rmdir(unzipped_dir, { recursive: true }, (err) => {
					if (err) throw err;
				});
			})
			
			return
		}else{
			const fileName = path.basename(filePath);
			const content = fs.readFileSync(filePath, 'utf-8');

			classify(content.toString()).then(function(result:any){
				if(result){
					result['file'] = fileName
					panel.webview.html = getWebviewContent(result)
					accordion = ''
				}else{
					vscode.window.showErrorMessage('Cannot read the file. Make sure it is a valid not-empty YAML-based Ansible file');
				}
			})
		}
	});

	context.subscriptions.push(disposable);
}



// this method is called when your extension is deactivated
export function deactivate() {}

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

	<p align="center">
		<img src="https://github.com/radon-h2020/radon-ansible-metrics-plugin/raw/master/media/metric-values.png" width="300" />
	</p>

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
</html>`

function getWebviewContent(data: JSON) {
	
	let tbody:string = ''
	let title:string = ''

	for (let [key, value] of Object.entries(data)) {
		let formatted_name = key.toLowerCase()
			.split('_')
			.map((s) => s.charAt(0).toUpperCase() + s.substring(1))
			.join(' ');
		
		let color_class = 'white'

		if(key in thresholds){
			if(value <= thresholds[key]['median']) color_class = 'white'
			else if(value <= thresholds[key]['q3']) color_class = 'yellow'
			else if(value <= thresholds[key]['outlier']) color_class = 'orange'
			else color_class = 'red'
			
			if(key == 'num_unique_names'){
				const iqr = thresholds[key]['q1'] + thresholds[key]['q3']
				if(value >= thresholds[key]['median']) color_class = 'white'
				else if(value >= thresholds[key]['q1']) color_class = 'yellow'
				else if(value >= thresholds[key]['q1'] - 1.5*iqr) color_class = 'orange'
				else color_class = 'red'
			}

			if(value != 0)
				tbody += `<tr><td>${formatted_name} <span type="button" data-toggle="tooltip" data-placement="bottom" title="${metrics_description[key]}">&#9432;</span></td><td><div style="text-align: right; background-color: ${color_class}">${value}</div></td></tr>`
		}

		if(key == 'file')
			title = value

	}
	
	let id = title.replace(/[_\.\/]/g, '')
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
	`

	return viewContent.replace('{{accordion}}', accordion)
}