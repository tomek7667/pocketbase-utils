const PocketBase = require("pocketbase/cjs");
const cliProgress = require("cli-progress");
const inquirer = require("inquirer");
const dotenv = require("dotenv");
const { Command } = require("commander");

const program = new Command();

const log = (args) => {
	const { silent } = program.opts();
	if (!silent) {
		console.log(args);
	}
};

const getOpts = (localOptions) => {
	const options = program.opts();
	if (options.env) {
		log(`Loading env from: "${options.env}"`);
		dotenv.config({ path: options.env });
	}
	const { PB_URL, PB_LOGIN, PB_PASSWORD } = process.env;
	if (!options.login) {
		options.login = PB_LOGIN;
	}
	if (!options.password) {
		options.password = PB_PASSWORD;
	}
	if (PB_URL) {
		options.url = PB_URL;
	}

	if (!options.login || !options.password) {
		log("Login and password are required. Use `pb --help` for more info.");
		process.exit(1);
	}
	return {
		...localOptions,
		...options,
	};
};

const acquireClient = async (options) => {
	const { url, login, password } = options;
	const client = new PocketBase(url);
	await client.admins.authWithPassword(login, password);
	return client;
};

program.name("pb").description("CLI utils for pocketbase").version("0.0.1");

program
	.option("-u, --url <url>", "URL", "http://127.0.0.1:8090")
	.option(
		"-l, --login <login>",
		"Admin login, if blank, will be taken from env PB_LOGIN"
	)
	.option(
		"-p, --password <password>",
		"Admin password, if blank, will be taken from env PB_PASSWORD"
	)
	.option(
		"-e, --env <path_to_env_file>",
		"Path to optional .env file to load env vars from"
	)
	.option("-s, --silent", "Silent mode (no output)");

const truncate = async (table, client) => {
	let { silent } = program.opts();
	let { items, totalItems } = await client.collection(table).getList(1, 50);
	let bar;
	if (!silent) {
		bar = new cliProgress.SingleBar(
			{
				format: `Truncating table "${table}" [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}`,
			},
			cliProgress.Presets.shades_classic
		);
		bar.start(totalItems, 0);
	}
	while (items.length > 0) {
		const ids = items.map((item) => item.id);
		for (const id of ids) {
			await client.collection(table).delete(id);
			if (!silent) {
				bar.increment();
			}
		}
		const result = await client.collection(table).getList(1, 50);
		items = result.items;
	}
	if (!silent) {
		bar.stop();
	}
};

program
	.command("truncate")
	.argument("<table>", "Table name")
	.option("-y, --yes", "Skip confirmation")
	.description("Utility for truncating the specified table")
	.action(async (table, localOptions) => {
		const options = getOpts(localOptions);
		const client = await acquireClient(options);
		if (options.yes === undefined) {
			const { confirm } = await inquirer.prompt([
				{
					type: "confirm",
					name: "confirm",
					message: `Truncate table "${table}"?`,
				},
			]);
			if (!confirm) {
				log("Aborted");
				process.exit(0);
			}
		}
		await truncate(table, client);
	});

program.parse();
