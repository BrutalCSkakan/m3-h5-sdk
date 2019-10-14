#!/usr/bin/env node

import * as program from 'commander';
import * as fs from 'fs-extra';
import * as inquirer from 'inquirer';
import { buildProject, INewProjectOptions, IServeOptions, login, newProject, serveProject, setConfiguration } from './commands';
import { isValidProxyUrl } from './utils';

const versionNumber = require('../package.json').version;

const exit = (message?: string, outputHelp = true) => {
   if (message) {
      console.error('ERROR:', message);
   }
   if (outputHelp) {
      program.outputHelp();
   }
   process.exit(1);
};

const wrapServe = async (options: IServeOptions) => {
   if (!fs.existsSync('odin.json')) {
      exit('Could not find an Odin configuration file.', false);
   }
   console.log('Starting Dev Server...');
   try {
      await serveProject(options);
   } catch (error) {
      console.error(error);
      exit('Serving was aborted because of an error', false);
   }
};

const wrapNew = async (options: INewProjectOptions) => {
   try {
      await newProject(options);
      console.log('Done!');
      console.log('To continue with the new project, install dependencies and start the server:');
      console.log('\tcd', options.name);
      console.log('\tnpm install');
      console.log('\todin serve');
   } catch (error) {
      console.error(error);
      exit('Failed to create new project', false);
   }
};

program
   .version(versionNumber)
   .name('odin')
   .description('Tool to set up and manage a web application with Odin.');

program
   .command('new [projectName]')
   .description('Create a new project')
   .option('--proxy [url]', 'URL to MI REST Service, e.g "https://my.m3.environment.com:54008"')
   .option('-m, --material', 'Set up as a Material-styled project')
   .option('-s, --soho', 'Set up as a Soho-styled project')
   .option('-a, --angular', 'Set up as an Angular CLI project')
   .option('-i, --install', 'Install NPM dependencies')
   .option('--skip-git', 'Skip initialization of a git repository')
   .action(async (projectName, options) => {
      if (!projectName) {
         return await inquireNewProject();
      }
      const newOptions: INewProjectOptions = {
         name: projectName,
         style: 'none',
      };
      if (options.proxy) {
         if (!isValidProxyUrl(options.proxy)) {
            exit(`Proxy url '${options.proxy}' is invalid. It should be of the format: protocol://hostname:port`);
         }
         newOptions.proxy = {
            target: options.proxy,
         };
      }

      if (options.material) {
         newOptions.style = 'material';
      } else if (options.soho) {
         newOptions.style = 'soho';
      } else {
         newOptions.style = 'none';
      }

      if (options.skipGit) {
         newOptions.git = false;
      } else {
         newOptions.git = true;
      }

      if (options.angular) {
         newOptions.angular = true;
      }

      if (options.install) {
         newOptions.install = true;
      }

      await wrapNew(newOptions);
   });

program
   .command('serve')
   .description('Start web server and builder')
   .option('-p, --port <port>', 'Port to listen on')
   .option('-m, --multi-tenant', 'Enable Multi-Tenant proxy')
   .option('-i, --ion-api', 'Use ION API for Multi-Tenant proxy requests')
   .action(async (options) => {
      await wrapServe({
         port: options.port || 8080,
         multiTenant: Boolean(options.multiTenant),
         ionApi: Boolean(options.ionApi),
      });
   });

program
   .command('build')
   .description('Build a production-ready application')
   .action(() => {
      if (!fs.existsSync('odin.json')) {
         exit('Could not find an Odin configuration file.', false);
      }
      console.log('Building project...');
      buildProject().then(() => {
         console.log('Project built successfully');
      }).catch(error => {
         console.error('Build failed:', error);
      });
   });

program
   .command('set <key> <value>')
   .description('Configure an existing project. Valid configuration keys are: name, m3-proxy, ion-proxy')
   .action((key: string, value: string) => {
      try {
         setConfiguration(key, value);
      } catch (error) {
         console.error(error);
         exit('Configuration failed', false);
      }
   });

program
   .command('login')
   .description('Log in to the configured environment')
   .action(async () => {
      console.log('Logging in to the configured environment. A separate browser window will open with the login screen.');
      await login();
      console.log('Done! You can now start the development server with \'odin serve --multi-tenant\'');
   });

const inquireNewProject = async () => {
   const nameQuestion: inquirer.Question = {
      name: 'projectName',
      type: 'input',
      message: 'What is the name of the project?',
      validate: (name) => {
         if (name.match(/^[a-zA-Z0-9-]+$/) === null) {
            return 'The project name can only have letters, numbers and dashes';
         } else if (fs.existsSync(name)) {
            return 'The directory already exists.';
         } else {
            return true;
         }
      }
   };
   const proxyQuestion: inquirer.Question = {
      name: 'proxy',
      type: 'input',
      message: 'What is the URL of your M3 environment?',
      default: 'https://example.com:8080',
      validate: (input) => {
         if (!isValidProxyUrl(input)) {
            return 'The URL must look like the following: protocol://hostname:port';
         } else {
            return true;
         }
      }
   };
   const frameworkQuestion: inquirer.Question = {
      name: 'framework',
      type: 'list',
      message: 'Which view framework do you want to use?',
      choices: [
         {
            name: 'Angular',
            value: 'angular',
         },
         {
            name: 'None',
            value: 'none',
         },
      ],
      default: 'angular'
   };
   const styleQuestion: inquirer.Question = {
      name: 'style',
      type: 'list',
      message: 'Which style library do you want to use?',
      choices: [
         {
            name: 'SoHo (Infor Design System)',
            value: 'soho',
         },
         {
            name: 'Material Design',
            value: 'material',
         },
         {
            name: 'None',
            value: 'none',
         },
      ],
      default: 'soho'
   };
   const gitQuestion: inquirer.Question = {
      name: 'git',
      type: 'confirm',
      message: 'Should Git be used for the project?',
      default: true,
   };
   const installQuestion: inquirer.Question = {
      name: 'install',
      type: 'confirm',
      message: 'Should dependencies be installed? This can take a while.',
      default: false
   };
   const answers = await inquirer.prompt([
      nameQuestion,
      frameworkQuestion,
      styleQuestion,
      proxyQuestion,
      gitQuestion,
      installQuestion,
   ]);
   const newProjectOptions: INewProjectOptions = {
      name: answers.projectName,
      style: answers.style,
      angular: answers.framework === 'angular',
      proxy: {
         target: answers.proxy,
      },
      install: answers.install,
      git: answers.git,
   };
   await wrapNew(newProjectOptions);
};

const inquireServeProject = async () => {
   const portQuestion: inquirer.Question = {
      name: 'port',
      type: 'input',
      default: '8080',
      message: 'Which port should be used?',
      validate: (port) => {
         if (port.match(/^\d+$/) === null) {
            return 'The port must be a number, e.g 8080';
         } else {
            return true;
         }
      }
   };
   const mtQuestion: inquirer.Question = {
      name: 'multiTenant',
      type: 'confirm',
      default: false,
      message: 'Enable Multi-Tenant proxy?'
   };
   const ionQuestion: inquirer.Question = {
      name: 'ionApi',
      type: 'confirm',
      default: false,
      when: (previousAnswers => Boolean(previousAnswers.multiTenant)),
      message: 'Use ION API for Multi-Tenant proxy requests?'
   };
   const answers = await inquirer.prompt([portQuestion, mtQuestion, ionQuestion]);
   const port = parseInt(answers.port, 10);
   const multiTenant = Boolean(answers.multiTenant);
   const ionApi = Boolean(answers.ionApi);
   await wrapServe({ port, multiTenant, ionApi });
};

const inquireCommand = async () => {
   const commandQuestion: inquirer.Question = {
      name: 'command',
      type: 'list',
      message: 'What do you want to do?',
      choices: [
         {
            name: 'Create new project',
            value: 'new',
         },
         {
            name: 'Start development server',
            value: 'serve',
         },
         {
            name: 'Build project for production',
            value: 'build',
         },
      ]
   };
   const commandAnswers = await inquirer.prompt([commandQuestion]);
   switch (commandAnswers.command) {
      case 'new':
         await inquireNewProject();
         break;
      case 'serve':
         await inquireServeProject();
         break;
      case 'build':
         buildProject();
         break;
      default:
         break;
   }
};

// Deal with unknown commands
// https://github.com/tj/commander.js/commit/503845b758ad51085319c491cf2c9367542ef1f9#diff-1e290ac8433d555bce009b162cb869d0
program.on('command:*', ([command]) => {
   exit(`Unknown command '${command}'`, true);
});

const isWizard = !process.argv.slice(2).length;
if (isWizard) {
   inquireCommand();
}

program.parse(process.argv);
