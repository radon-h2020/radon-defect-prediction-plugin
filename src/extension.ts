import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const AXIOS = require('axios').default;
const cp = require('child_process')
const extract = require('extract-zip')

const HTML_SPINNER = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
.loader {
  border: 16px solid #f3f3f3;
  border-radius: 50%;
  border-top: 16px solid #3498db;
  width: 120px;
  height: 120px;
  -webkit-animation: spin 2s linear infinite; /* Safari */
  animation: spin 2s linear infinite;
}

/* Safari */
@-webkit-keyframes spin {
  0% { -webkit-transform: rotate(0deg); }
  100% { -webkit-transform: rotate(360deg); }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
</head>
<body>

<div class="loader" style="margin:0 auto; margin-top: 100px;"></div>
<h2> <p align="center">{{info}}</p></h2>

</body>
</html>
`

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
	num_imports: "Number of import keys",
	num_interfaces: "Number of interfaces in the blueprint",
	num_keys: "Count of keys in the dictionary representing a playbook or tasks",
	num_loops: "Count of 'loop' and 'with_*' syntax occurrences",
	num_node_templates: "Number of node templates in the blueprint",
	num_node_types: "Number of node types in the blueprint",
	num_parameters: "Count the total number of parameters, that is, the keys of the dictionary representing a module. In Ansible parameters (or arguments) describe the desired state of the system. Interpretation: the more the parameters, the more challenging to debug and test the blueprint.",
	num_properties: "Count the total number of properties in the blueprint",
	num_relationship_templates: "Number of relationship templates in the blueprint",
	num_relationship_types: "Number of relationship types in the blueprint",
	num_shell_scripts: "Number of shell scripts called by the blueprint",
	num_tasks: "Measures the number of functions in a script. An Ansible task is equivalent to a method, as its goal is to execute a module with very specific arguments. Interpretation: the higher the number of tasks, the more complex and the more challenging to maintain the blueprint.",
	num_tokens: "Count the words separated by a blank space. Interpretation: the more the tokens, the more complex is the blueprint.",
	num_unique_names: "Number of plays and tasks with a unique name. Uniquely naming plays and tasks is a best practice to locate problematic tasks quickly. Duplicate names may lead to not deterministic or at least not obvious behaviors. Interpretation: the more the entities with unique names the higher the maintainability and readability of the blueprint.",
	num_vars: "Number of variables in the playbook.",
	text_entropy: "Mesures the complexity of a script based on its information content, analogous to the class entropy complexity. Interpretation: the higher the entropy, the more challenging to maintain the blueprint."
}


var accordion:string = ''
var ansible_model_id:any = undefined
var tosca_model_id:any = undefined

function walk(dir: any, filelist: any) {
	/*
	Return all the yaml and tosca files in the folder 
	*/
	let files = fs.readdirSync(dir);
	filelist = filelist || [];
	files.forEach(function(file) {
		if (fs.statSync(path.join(dir, file)).isDirectory()) 
	  		filelist = walk(path.join(dir, file), filelist);
	  	else if (file.split('.').pop() == 'tosca')
			filelist.push(path.join(dir, file));
	});

	return filelist;
};

function extract_ansible_metrics(filePath:string) {
	try{
		const res = cp.execSync(`ansible-metrics ${filePath} -o --omit-zero-metrics`)
		return JSON.parse(res.toString())
	}
	catch (err){
		console.log(err)
		return undefined
	}
}

function extract_tosca_metrics(filePath:string) {
	try{	
		const res = cp.execSync(`tosca-metrics ${filePath} -o --omit-zero-metrics`)
		return JSON.parse(res.toString())
	}
	catch (err){
		console.log(err)
		return undefined
	}
}

async function fetch_model(language:string) {
	try{
		return await Promise.resolve(
			AXIOS.get(`https://radon-test-api.herokuapp.com/models?language=${language}&repository_size=500&has_license=1`)
				.then(function(response: any) { return response.data.model_id })
				.catch(function() { return undefined })
		)
	}
	catch (err){
		console.log(err)
		return undefined
	}
}

async function predict(queryParams: string){
	try{
		return await Promise.resolve(
			AXIOS.get(`https://radon-test-api.herokuapp.com/predictions?${queryParams}`)
			.then(function(response: any) { return response.data })
			.catch(function() { return undefined })
		)
	}
	catch (err){
		console.log(err)
		return undefined
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('radon-defect-prediction-plugin.run', async (uri: vscode.Uri)  => {
		
		console.log(uri)

		
		var panel:any = vscode.window.createWebviewPanel(
			'radon-defect-predictor',
			'Receptor',
			vscode.ViewColumn.Two,
			{
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'html'))],
				enableScripts: true
			}
		);
		
		panel.webview.html = HTML_SPINNER.replace('{{info}}', '')

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Running failures detection",
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the operation");
			});

			progress.report({ increment: 0 });
			
			let filePath = uri.path
			filePath = filePath.replace('\\c:', 'C:')

			const fileExtension = filePath.split('.').pop()
			
			progress.report({ increment: 25, message: "Model fetched! I am runnig the predictions. Please wait..." });
			
			if(fileExtension == 'csar') {
				panel.webview.html = HTML_SPINNER.replace('{{info}}', 'Extracting the CSAR...')
				accordion = ''

				const model_id = tosca_model_id ? tosca_model_id : await fetch_model('tosca')	
				const unzipped_dir = filePath.replace('.csar', '')
				
				progress.report({ increment: 50, message: "Extracting and analyzing the CSAR..." });
				extract(filePath, {dir: unzipped_dir}).then(function (err: any) {
					
					if(err){
						console.log(err)
						panel.webview.html = '<h2>Ops. We are sorry. An error occurred!</h2>'
						return
					}

					let files = walk(unzipped_dir, [])
					
					panel.webview.html = HTML_SPINNER.replace('{{info}}', 'Predicting the failure-proneness of TOSCA blueprints...')
					progress.report({ increment: 80, message: "Predicting failure-proneness of TOSCA blueprints..." });

					for(let i=0; i < files.length; i++){
						const filePath = files[i]

						const metrics = extract_tosca_metrics(filePath)
						if(metrics == undefined){
							continue
						}

						let query = ''
						for (let [key, value] of Object.entries(metrics)) {
							if(typeof value == "number"){
								query += key + "="+ value + "&"
							}	
						}

						query += "language=tosca&model_id=" + model_id

						predict(query).then((prediction: any) =>{
							
							if(prediction == undefined){
								return
							}
							
							prediction['file'] = path.basename(filePath);
							prediction['metrics'] = metrics
	
							panel.webview.html = getWebviewContent(prediction)
						})
					}

					// delete folder
					fs.rmdir(unzipped_dir, { recursive: true }, (err) => {
						if (err) throw err;
					});

					progress.report({ increment: 100, message: "Done!" });
				})
			}
			else{
				panel.webview.html = HTML_SPINNER.replace('{{info}}', 'Running prediction. Please wait...')
				accordion = ''
				let language = undefined
				let metrics = undefined
				let model_id = undefined

				progress.report({ increment: 50, message: "Preparing model..." });

				const content = fs.readFileSync(filePath, 'utf-8');
				if(content.includes('tosca_definitions_version')) {
					language = 'tosca'
					metrics = extract_tosca_metrics(filePath)
					model_id = tosca_model_id ? tosca_model_id : await fetch_model('tosca')
				} else {
					language = 'ansible'
					metrics = extract_ansible_metrics(filePath)
					model_id = ansible_model_id ? ansible_model_id : await fetch_model('ansible')
				}

				let query = ''
				for (let [key, value] of Object.entries(metrics)) {
					if(typeof value == "number"){
						query += key + "="+ value + "&"
					}	
				}

				query += "language=" + language + "&model_id=" + model_id
				
				const prediction: any = await predict(query)
				prediction['file'] = path.basename(filePath);
				prediction['metrics'] = metrics

				progress.report({ increment: 100, message: "Done! See the opened panel for more information." });
				panel.webview.html = getWebviewContent(prediction)
			}

			return;
		});
	}));
}


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


function getWebviewContent(data: any) {
	let title:string = data.file.toString()
	let tbody:string = ''

	Object.entries(data.metrics).forEach(([key, value]:any) => {

		let formatted_name = key.toLowerCase()
			.split('_')
			.map((s:string) => s.charAt(0).toUpperCase() + s.substring(1))
			.join(' ');
		
		let color_class = 'white'

		if(key in thresholds){
			if(value <= thresholds[key]['median']) color_class = 'white'
			else if(value <= thresholds[key]['q3']) color_class = 'yellow'
			else if(value <= thresholds[key]['outlier']) color_class = 'orange'
			else color_class = 'red'
			
			if(key == 'num_unique_names'){  // The more, the better
				const iqr = thresholds[key]['q1'] + thresholds[key]['q3']
				if(value >= thresholds[key]['median']) color_class = 'white'
				else if(value >= thresholds[key]['q1']) color_class = 'yellow'
				else if(value >= thresholds[key]['q1'] - 1.5*iqr) color_class = 'orange'
				else color_class = 'red'
			}

			//tbody += `<tr><td>${formatted_name} <span type="button" data-toggle="tooltip" data-placement="bottom" title="${metrics_description[key]}">&#9432;</span></td><td><div style="text-align: right; background-color: ${color_class}">${value}</div></td></tr>`
		}

		if (key in metrics_description){
			tbody += `<tr><td>${formatted_name} <span type="button" data-toggle="tooltip" data-placement="bottom" title="${metrics_description[key]}">&#9432;</span></td><td><div style="text-align: right; background-color: ${color_class}">${value}</div></td></tr>`
		}
	});
	
	let prediction_description = ''

	if(data.failure_prone){

		for(const defect of data.defects){
			if(defect.type == "general"){
				prediction_description += 'This script was predicted <b>failure-prone</b> because:<ul>'
			}else{
				prediction_description += `This script was predicted having a <b>${defect.type}-related problem</b> because:<ul>`
			}

			for(const clause of defect.decision){
				let formatted_metric_name = clause[0].toLowerCase()
					.split('_')
					.map((s:string) => s.charAt(0).toUpperCase() + s.substring(1))
					.join(' ');
				
				if(clause[1] == "<=" && clause[2] == 0){
					clause[1] = "="
				}

				prediction_description += `<li>${formatted_metric_name} ${clause[1]} ${Math.round(clause[2] * 100) / 100}</li>`
			}
			prediction_description += '</ul><br>'
		}
	}

	let id = title.replace(/[_\.\/]/g, '')
	accordion += `
		<div class="card">
			<button class="btn btn-link text-left" type="button" data-toggle="collapse" data-target="#collapse-${id}" aria-expanded="false" aria-controls="collapse-${id}">
				<div class="card-header">
					<h5 class="mb-0">${title} ${data.failure_prone ? '&#9888;':''}</h5>
				</div>
			</button>
			<div id="collapse-${id}" class="collapse" aria-labelledby="heading-${id}" data-parent="#accordion">
				<div class="card-body">
					<p> <b>Status:</b> ${data.failure_prone ? 'failure-prone':'no action required'}</p> </br>
					${prediction_description}
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