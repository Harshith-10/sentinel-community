import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';

// --- Interfaces ---
interface LanguageDetails {
  name: string; // e.g., 'python'
  displayName: string; // e.g., 'Python'
  extension: string; // e.g., '.py'
  command: string; // e.g., 'python3'
  args: string[]; // e.g., ['{file}']
  compile?: {
    command: string;
    args: string[];
    timeout: number;
  };
  filename?: string;
  dockerImage: string; // e.g., 'python:3.11-alpine'
  k8s: {
    replicas: number;
    cpu: string;
    memory: string;
  };
}

// --- Configuration Paths ---
const ROOT_DIR = path.join(__dirname, '..');
const SENTINEL_CONFIG_PATH = path.join(ROOT_DIR, 'sentinel.config.json');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');
const DOCKERFILES_DIR = path.join(ROOT_DIR, 'dockerfiles');
const K8S_DIR = path.join(ROOT_DIR, 'k8s');
const LANG_CONFIG_DIR = path.join(ROOT_DIR, 'config', 'languages');
const DOCKER_COMPOSE_PATH = path.join(ROOT_DIR, 'docker-compose.yml');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

// --- Helper Functions ---
async function loadSentinelConfig(): Promise<LanguageDetails[]> {
  try {
    const content = await fs.readFile(SENTINEL_CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as LanguageDetails[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // Return empty array if file doesn't exist
    }
    throw error;
  }
}

async function saveSentinelConfig(config: LanguageDetails[]): Promise<void> {
  // Sort by name for consistency
  config.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(SENTINEL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function loadTemplate(name: string): Promise<string> {
  return fs.readFile(path.join(TEMPLATES_DIR, name), 'utf-8');
}

function replacePlaceholders(template: string, lang: LanguageDetails): string {
  return template
    .replace(/{{languageName}}/g, lang.name)
    .replace(/{{displayName}}/g, lang.displayName)
    .replace(/{{dockerImage}}/g, lang.dockerImage)
    .replace(/{{k8sReplicas}}/g, String(lang.k8s.replicas))
    .replace(/{{k8sCpu}}/g, lang.k8s.cpu)
    .replace(/{{k8sMemory}}/g, lang.k8s.memory);
}

// --- Core Logic ---
async function regenerateAll() {
  console.log(chalk.blue('🔄 Regenerating all configuration files...'));

  const languages = await loadSentinelConfig();
  await fs.mkdir(DOCKERFILES_DIR, { recursive: true });
  await fs.mkdir(K8S_DIR, { recursive: true });
  await fs.mkdir(LANG_CONFIG_DIR, { recursive: true });

  // 1. Generate Language JSON, Dockerfiles, and K8s manifests
  for (const lang of languages) {
    console.log(`  - Processing ${chalk.yellow(lang.displayName)}...`);

    // Language Config
    const { k8s, dockerImage, ...langConfig } = lang;
    await fs.writeFile(
      path.join(LANG_CONFIG_DIR, `${lang.name}.json`),
      JSON.stringify(langConfig, null, 2)
    );

    // Dockerfile
    const dockerfileTemplate = await loadTemplate('Dockerfile.executor.template');
    const dockerfileContent = replacePlaceholders(dockerfileTemplate, lang);
    await fs.writeFile(path.join(DOCKERFILES_DIR, `Dockerfile.${lang.name}`), dockerfileContent);

    // K8s Deployment
    const k8sDeploymentTemplate = await loadTemplate('k8s.deployment.template.yaml');
    const k8sDeploymentContent = replacePlaceholders(k8sDeploymentTemplate, lang);
    await fs.writeFile(path.join(K8S_DIR, `executor-${lang.name}.yaml`), k8sDeploymentContent);

    // K8s KEDA Scaler
    const k8sKedaTemplate = await loadTemplate('k8s.keda.template.yaml');
    const k8sKedaContent = replacePlaceholders(k8sKedaTemplate, lang);
    await fs.writeFile(path.join(K8S_DIR, `keda-${lang.name}.yaml`), k8sKedaContent);
  }

  // 2. Generate Docker Compose
  const dockerComposeBase = await loadTemplate('docker-compose.base.yaml');
  const dockerComposeServiceTemplate = await loadTemplate('docker-compose.service.template.yaml');
  let services = '';
  for (const lang of languages) {
    services += replacePlaceholders(dockerComposeServiceTemplate, lang);
  }
  await fs.writeFile(DOCKER_COMPOSE_PATH, dockerComposeBase + services);

  // 3. Update package.json scripts
  const packageJson = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, 'utf-8'));
  const buildCommands = languages.map(
    l => `docker build -t your-repo/sentinel-executor-${l.name}:latest -f dockerfiles/Dockerfile.${l.name} .`
  );
  const pushCommands = languages.map(
    l => `docker push your-repo/sentinel-executor-${l.name}:latest`
  );
  packageJson.scripts['docker:build:executors'] = buildCommands.join(' && ');
  packageJson.scripts['docker:push:executors'] = pushCommands.join(' && ');
  await fs.writeFile(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));

  console.log(chalk.green.bold('✅ All files regenerated successfully!'));
  console.log(chalk.yellow('Running `npm install` to format package.json...'));
  execSync('npm install', { stdio: 'inherit' });
}

async function addLanguage() {
  console.log(chalk.bold.green('🚀 Add a New Language to Sentinel'));

  const languages = await loadSentinelConfig();

  const answers = await inquirer.prompt([
    { name: 'name', message: "Language Name (lowercase, e.g., 'ruby')", default: 'ruby' },
    // More prompts...
    { name: 'displayName', message: "Display Name (e.g., 'Ruby')", default: 'Ruby' },
    { name: 'extension', message: "File Extension (e.g., '.rb')", default: '.rb' },
    { name: 'command', message: "Execution Command (e.g., 'ruby')", default: 'ruby' },
    { name: 'argsStr', message: "Execution Arguments, comma-separated (e.g., '{file}')", default: '{file}' },
    { name: 'dockerImage', message: "Docker Base Image (e.g., 'ruby:3.2-alpine')", default: 'ruby:3.2-alpine' },
    { name: 'isCompiled', type: 'confirm', message: 'Is this a compiled language?', default: false },
    {
      name: 'compileCommand',
      message: "Compilation Command (e.g., 'gcc')",
      when: (ans) => ans.isCompiled,
    },
    {
      name: 'compileArgsStr',
      message: "Compilation Arguments, comma-separated (e.g., '{file},-o,{dir}/program')",
      when: (ans) => ans.isCompiled,
    },
    { name: 'k8sReplicas', message: 'Initial K8s replicas:', default: 1, type: 'number' },
    { name: 'k8sCpu', message: 'K8s CPU request/limit (e.g., "500m"):', default: '500m' },
    { name: 'k8sMemory', message: 'K8s Memory request/limit (e.g., "512Mi"):', default: '512Mi' },
  ]);

  const existingIndex = languages.findIndex(l => l.name === answers.name);
  if (existingIndex !== -1) {
    const { overwrite } = await inquirer.prompt([{
      name: 'overwrite',
      type: 'confirm',
      message: `Language '${answers.name}' already exists. Overwrite?`,
      default: false,
    }]);
    if (!overwrite) {
      console.log(chalk.yellow('Operation cancelled.'));
      return;
    }
  }

  const newLang: LanguageDetails = {
    name: answers.name,
    displayName: answers.displayName,
    extension: answers.extension,
    command: answers.command,
    args: answers.argsStr.split(',').map((s: string) => s.trim()),
    dockerImage: answers.dockerImage,
    k8s: {
      replicas: answers.k8sReplicas,
      cpu: answers.k8sCpu,
      memory: answers.k8sMemory,
    },
  };

  if (answers.isCompiled) {
    newLang.compile = {
      command: answers.compileCommand,
      args: answers.compileArgsStr.split(',').map((s: string) => s.trim()),
      timeout: 10000,
    };
  }
  
  if (existingIndex !== -1) {
    languages[existingIndex] = newLang;
  } else {
    languages.push(newLang);
  }

  await saveSentinelConfig(languages);
  await regenerateAll();
}

async function removeLanguage() {
  console.log(chalk.bold.red('🔥 Remove a Language from Sentinel'));
  const languages = await loadSentinelConfig();
  if (languages.length === 0) {
    console.log(chalk.yellow('No languages configured to remove.'));
    return;
  }

  const { langToRemove } = await inquirer.prompt([{
    name: 'langToRemove',
    type: 'list',
    message: 'Which language do you want to remove?',
    choices: languages.map(l => l.name),
  }]);

  const { confirm } = await inquirer.prompt([{
      name: 'confirm',
      type: 'confirm',
      message: `Are you sure you want to permanently remove '${langToRemove}' and all its files?`,
      default: false,
    }]);

  if (!confirm) {
    console.log(chalk.yellow('Operation cancelled.'));
    return;
  }

  const updatedLanguages = languages.filter(l => l.name !== langToRemove);
  await saveSentinelConfig(updatedLanguages);

  // Clean up files
  const filesToDelete = [
    path.join(LANG_CONFIG_DIR, `${langToRemove}.json`),
    path.join(DOCKERFILES_DIR, `Dockerfile.${langToRemove}`),
    path.join(K8S_DIR, `executor-${langToRemove}.yaml`),
    path.join(K8S_DIR, `keda-${langToRemove}.yaml`),
  ];

  for (const file of filesToDelete) {
    try {
      await fs.unlink(file);
      console.log(`  - Deleted ${chalk.gray(file)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(chalk.red(`Error deleting ${file}:`), error);
      }
    }
  }

  await regenerateAll();
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case 'add':
      await addLanguage();
      break;
    case 'remove':
      await removeLanguage();
      break;
    case 'regenerate':
      await regenerateAll();
      break;
    default:
      console.log(chalk.red('Unknown command. Available commands: add, remove, regenerate'));
      break;
  }
}

main().catch(err => {
  console.error(chalk.red.bold('An unexpected error occurred:'), err);
  process.exit(1);
});