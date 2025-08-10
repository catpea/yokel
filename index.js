#!/usr/bin/env node

import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Executes a command with arguments in a Promise-based, abortable way.
 *
 * @param {string} command - Command to run.
 * @param {string[]} args - Arguments for the command.
 * @param {object} [options] - execFile options.
 * @param {AbortSignal} [options.signal] - Optional AbortSignal to cancel the process.
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function execCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    if (options.shell) {
      console.warn(
        chalk.yellow('[SECURITY] Shell option enabled — do not pass unsanitized user input!')
      );
    }

    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });

    // Optional: If the signal aborts, kill the child process
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        child.kill();
      });
    }
  });
}

/**
 * Reads and parses a package.json file
 * @param {string} packagePath - Path to the package directory
 * @returns {Promise<object>} Parsed package.json content
 */
async function readPackageJson(packagePath) {
  const packageJsonPath = join(packagePath, 'package.json');

  try {
    await access(packageJsonPath, constants.F_OK);
  } catch (error) {
    throw new Error(`No package.json found at ${packageJsonPath}`);
  }

  const content = await readFile(packageJsonPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Writes a package.json file with proper formatting
 * @param {string} packagePath - Path to the package directory
 * @param {object} packageData - Package.json data to write
 */
async function writePackageJson(packagePath, packageData) {
  const packageJsonPath = join(packagePath, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageData, null, 2) + '\n');
}

/**
 * Links a local dependency
 * @param {string} localPath - Relative path to the local dependency
 * @param {string} currentPath - Current working directory
 */
async function linkLocalDependency(localPath, currentPath) {
  const spinner = ora();

  try {
    // Resolve the absolute path
    const absolutePath = resolve(currentPath, localPath);

    // Check if the path exists
    try {
      await access(absolutePath, constants.F_OK);
    } catch (error) {
      throw new Error(`Path does not exist: ${absolutePath}`);
    }

    // Read the package.json from the local dependency
    spinner.start(`Reading package.json from ${chalk.cyan(localPath)}`);
    const depPackageJson = await readPackageJson(absolutePath);
    const depName = depPackageJson.name;
    const depVersion = depPackageJson.version;

    if (!depName) {
      throw new Error(`No package name found in ${join(absolutePath, 'package.json')}`);
    }

    spinner.succeed(`Found package: ${chalk.green(depName)} v${depVersion}`);

    // Step 1: Create global link in the dependency directory
    spinner.start(`Creating global link for ${chalk.cyan(depName)}`);
    await execCommand('npm', ['link'], { cwd: absolutePath });
    spinner.succeed(`Global link created for ${chalk.green(depName)}`);

    // Step 2: Link the package in the current directory
    spinner.start(`Linking ${chalk.cyan(depName)} in current project`);
    await execCommand('npm', ['link', depName], { cwd: currentPath });
    spinner.succeed(`Successfully linked ${chalk.green(depName)}`);

    return { name: depName, version: depVersion, path: localPath };
  } catch (error) {
    spinner.fail(`Failed to link dependency: ${error.message}`);
    throw error;
  }
}

/**
 * Updates package.json with local dependency information
 * @param {string} packagePath - Path to the package directory
 * @param {object} depInfo - Dependency information
 */
async function updatePackageJson(packagePath, depInfo) {
  const spinner = ora();

  try {
    spinner.start('Updating package.json');

    const packageJson = await readPackageJson(packagePath);

    // Initialize dependencies and localDependencies if they don't exist
    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }
    if (!packageJson.localDependencies) {
      packageJson.localDependencies = {};
    }

    // Add to regular dependencies
    packageJson.dependencies[depInfo.name] = `^${depInfo.version}`;

    // Add to localDependencies
    packageJson.localDependencies[depInfo.path] = `^${depInfo.version}`;

    // Write back the updated package.json
    await writePackageJson(packagePath, packageJson);

    spinner.succeed('Updated package.json');
  } catch (error) {
    spinner.fail(`Failed to update package.json: ${error.message}`);
    throw error;
  }
}

/**
 * Installs a single local dependency
 * @param {string} localPath - Relative path to the local dependency
 */
async function installSingle(localPath) {
  const currentPath = process.cwd();

  console.log(chalk.bold('\n📦 Installing local dependency:\n'));

  try {
    // Link the dependency
    const depInfo = await linkLocalDependency(localPath, currentPath);

    // Update package.json
    await updatePackageJson(currentPath, depInfo);

    console.log(chalk.green.bold('\n✅ Successfully installed local dependency!\n'));
  } catch (error) {
    console.error(chalk.red.bold('\n❌ Installation failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Installs all local dependencies from package.json
 */
async function installAll() {
  const currentPath = process.cwd();
  const spinner = ora();

  try {
    // Read current package.json
    spinner.start('Reading package.json');
    const packageJson = await readPackageJson(currentPath);
    spinner.succeed('Found package.json');

    if (!packageJson.localDependencies || Object.keys(packageJson.localDependencies).length === 0) {
      console.log(chalk.yellow('\n⚠️  No local dependencies found in package.json\n'));
      return;
    }

    console.log(chalk.bold('\n📦 Installing local dependencies:\n'));

    const dependencies = Object.entries(packageJson.localDependencies);
    let successCount = 0;
    let failureCount = 0;

    for (const [localPath, version] of dependencies) {
      console.log(chalk.blue(`\nProcessing: ${localPath}`));

      try {
        const depInfo = await linkLocalDependency(localPath, currentPath);

        // Update regular dependencies if needed
        if (!packageJson.dependencies) {
          packageJson.dependencies = {};
        }
        packageJson.dependencies[depInfo.name] = `^${depInfo.version}`;

        successCount++;
      } catch (error) {
        console.error(chalk.red(`  Failed: ${error.message}`));
        failureCount++;
      }
    }

    // Write back updated package.json with any new dependencies
    if (successCount > 0) {
      spinner.start('Updating package.json');
      await writePackageJson(currentPath, packageJson);
      spinner.succeed('Updated package.json');
    }

    // Summary
    console.log(chalk.bold('\n📊 Summary:'));
    console.log(chalk.green(`  ✅ Success: ${successCount}`));
    if (failureCount > 0) {
      console.log(chalk.red(`  ❌ Failed: ${failureCount}`));
    }
    console.log();

  } catch (error) {
    spinner.fail(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Unlinks a local dependency
 * @param {string} localPath - Relative path to the local dependency
 */
async function unlinkDependency(localPath) {
  const currentPath = process.cwd();
  const spinner = ora();

  try {
    // Resolve the absolute path
    const absolutePath = resolve(currentPath, localPath);

    // Read the package.json from the local dependency
    spinner.start(`Reading package.json from ${chalk.cyan(localPath)}`);
    const depPackageJson = await readPackageJson(absolutePath);
    const depName = depPackageJson.name;

    spinner.succeed(`Found package: ${chalk.green(depName)}`);

    // Unlink from current project
    spinner.start(`Unlinking ${chalk.cyan(depName)} from current project`);
    await execCommand('npm', ['unlink', depName], { cwd: currentPath });
    spinner.succeed(`Unlinked ${chalk.green(depName)} from current project`);

    // Remove from package.json
    spinner.start('Updating package.json');
    const packageJson = await readPackageJson(currentPath);

    if (packageJson.dependencies && packageJson.dependencies[depName]) {
      delete packageJson.dependencies[depName];
    }

    if (packageJson.localDependencies && packageJson.localDependencies[localPath]) {
      delete packageJson.localDependencies[localPath];
    }

    await writePackageJson(currentPath, packageJson);
    spinner.succeed('Updated package.json');

    console.log(chalk.green.bold('\n✅ Successfully unlinked local dependency!\n'));

  } catch (error) {
    spinner.fail(`Failed to unlink dependency: ${error.message}`);
    process.exit(1);
  }
}

// Create the CLI program
const program = new Command();

program
  .name('local-dev')
  .description('Manage local NPM dependencies with automatic linking')
  .version('1.0.0');

program
  .command('install [path]')
  .alias('i')
  .description('Install a local dependency or all local dependencies from package.json')
  .action(async (path) => {
    if (path) {
      await installSingle(path);
    } else {
      await installAll();
    }
  });

program
  .command('unlink <path>')
  .alias('u')
  .description('Unlink a local dependency')
  .action(async (path) => {
    await unlinkDependency(path);
  });

program
  .command('list')
  .alias('ls')
  .description('List all local dependencies')
  .action(async () => {
    try {
      const packageJson = await readPackageJson(process.cwd());

      if (!packageJson.localDependencies || Object.keys(packageJson.localDependencies).length === 0) {
        console.log(chalk.yellow('\n⚠️  No local dependencies found\n'));
        return;
      }

      console.log(chalk.bold('\n📦 Local Dependencies:\n'));

      for (const [path, version] of Object.entries(packageJson.localDependencies)) {
        console.log(`  ${chalk.cyan(path)} ${chalk.gray(version)}`);

        // Try to get the package name
        try {
          const absolutePath = resolve(process.cwd(), path);
          const depPackageJson = await readPackageJson(absolutePath);
          console.log(`    └─ ${chalk.green(depPackageJson.name)}`);
        } catch (error) {
          console.log(`    └─ ${chalk.red('(package.json not found)')}`);
        }
      }
      console.log();

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);
