import { Command } from 'commander'

export function greeting(name: string): string {
  return `Hello, ${name}!`
}

export function createProgram(
  write: (message: string) => void = console.log,
  version = '0.1.0',
): Command {
  return new Command()
    .name('difflab-cli')
    .description('A minimal Commander CLI powered by Bun')
    .version(version)
    .argument('[name]', 'name to greet', 'world')
    .action((name: string) => write(greeting(name)))
}
