import * as Glob from 'glob';

export function match(pattern: string): Promise<Array<string>>;
export function match(pattern: string, options: any): Promise<Array<string>>;
export function match(pattern: string, options?: any): Promise<Array<string>> {
    return new Promise<Array<string>>((resolve, reject) => {
        Glob(pattern, options, (err, matches) => {
            if (err)
                reject(err);
            else
                resolve(matches);
        });
    });
}