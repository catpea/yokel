# yokel 📦
The missing support for local package development workflow! Manage local NPM dependencies with automatic linking for streamlined development workflows.

`yokel` simplifies working with local NPM packages during development by automating the `npm link` workflow and maintaining a `localDependencies` section in your `package.json`.

## Features

- 🔗 **Automatic npm linking** - Handles the entire `npm link` cycle automatically
- 📝 **package.json management** - Maintains both `dependencies` and `localDependencies` sections
- 🚀 **Bulk operations** - Install all local dependencies with a single command
- 🎯 **Simple CLI** - Intuitive commands that mirror npm's interface
- 🔄 **Reversible** - Easy unlinking of local dependencies
- 📊 **Dependency listing** - View all your local dependencies at a glance

## Installation

Install globally to use across all your projects:

```bash
npm install -g yokel
```

## Usage

### Install a Local Dependency

To add a local package as a dependency:

```bash
yokel install ../my-local-package
# or shorthand
yokel i ../my-local-package
```

This command will:
1. Read the `package.json` from `../my-local-package`
2. Add the package to your `dependencies` with its current version
3. Add the path and version to `localDependencies`
4. Run `npm link` in the local package directory
5. Run `npm link <package-name>` in your current directory

### Install All Local Dependencies

When you have existing `localDependencies` in your `package.json`:

```bash
yokel install
# or shorthand
yokel i
```

This will link all packages listed in `localDependencies`.

### List Local Dependencies

View all your local dependencies:

```bash
yokel list
# or shorthand
yokel ls
```

### Unlink a Local Dependency

Remove a local dependency:

```bash
yokel unlink ../my-local-package
# or shorthand
yokel u ../my-local-package
```

## package.json Structure

After installing a local dependency, your `package.json` will look like this:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "my-local-package": "^2.1.0"
  },
  "localDependencies": {
    "../my-local-package": "^2.1.0"
  }
}
```

## Using with npm Scripts

You can integrate `yokel` into your npm scripts, particularly useful in `postinstall`:

```json
{
  "scripts": {
    "postinstall": "yokel install",
    "dev:link": "yokel install",
    "dev:unlink": "yokel unlink ../my-local-package"
  }
}
```

## Use Cases

### Monorepo Development
Perfect for monorepo setups where packages depend on each other:

```bash
# In packages/app
yokel i ../shared-utils
yokel i ../ui-components
```

### Library Development
Test your library in a real project before publishing:

```bash
# In your test project
yokel i ~/projects/my-awesome-library
```

### Feature Development
Work on a dependency feature without publishing:

```bash
# Link the dependency you're modifying
yokel i ../node_modules/some-package-fork
```

## How It Works

`yokel` automates the traditional npm link workflow:

**Traditional Workflow:**
```bash
cd ../my-local-package
npm link
cd -
npm link my-local-package
# Manually edit package.json
```

**With yokel:**
```bash
yokel i ../my-local-package
# Done! ✅
```

## Advantages

1. **Persistence** - Local dependencies are stored in `package.json`, making them shareable with your team
2. **Automation** - The `postinstall` hook can automatically link dependencies after `npm install`
3. **Clarity** - The `localDependencies` section clearly shows which packages are linked locally
4. **Version Tracking** - Maintains version information for all local dependencies

## Requirements

- Node.js >= 18.0.0
- npm >= 8.0.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Author

Your Name

---

Made with ❤️ for developers who work with local packages
