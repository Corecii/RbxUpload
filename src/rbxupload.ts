import * as readline from "readline";

export interface IOptions {
    file: string;
    type: string;
    group?: number;
    id?: number;
    name?: string;
    description?: string;
}

export function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
    }));
}
