import * as Handlebars from 'handlebars';
import * as HandlebarsHelpers from 'handlebars-helpers';
import * as Bluebird from 'bluebird';
import * as FS from 'fs-extra';
import * as Path from 'path';

import { v4 as Uuid } from 'uuid'
import * as Crypto from 'crypto';

import * as Yaml from 'js-yaml';

import * as _ from 'lodash';

import { CreateRendererHandler, ARenderer, Context } from '@jlekie/alchemist';

import * as Glob from './lib/globAsync';

export async function resolveModuleIdentifier(identifier: string, basePath?: string) {
    const resolvedPath = require.resolve(identifier, basePath ? {
        paths: [ basePath ]
    } : undefined);

    return resolvedPath;
}
export async function resolveModuleArtifactPath(identifier: string, basePath?: string) {
    if (identifier.indexOf('#') >= 0) {
        const [ moduleIdentifier, globPath ] = identifier.split('#', 2);

        const resolvedModuleIdentifier = await resolveModuleIdentifier(moduleIdentifier, basePath);

        let resolvedModuleIdentifierDir = Path.dirname(resolvedModuleIdentifier);
        if (resolvedModuleIdentifierDir.endsWith('dist')) {
            resolvedModuleIdentifierDir = Path.dirname(resolvedModuleIdentifierDir);
        }

        return Path.resolve(resolvedModuleIdentifierDir, globPath);
    }
    else {
        if (basePath)
            return Path.resolve(basePath, identifier);
        else
            return Path.resolve(identifier);
    }
}

export class HandlebarsRenderer extends ARenderer {
    public readonly templates: string[];
    public readonly partials: string[];

    // private readonly handlebars: typeof Handlebars;

    public constructor(templates: string[], partials?: string[]) {
        super();

        this.templates = templates;
        this.partials = partials || [];

        // this.handlebars = Handlebars.create();

        // HandlebarsHelpers({
        //     handlebars: this.handlebars
        // });

        // this.handlebars.registerHelper('upperFirst', (value: any) => _.upperFirst(value));
        // this.handlebars.registerHelper('lowerFirst', (value: any) => _.lowerFirst(value));
        // this.handlebars.registerHelper('repeat', (value: any, count: number) => _.repeat(value, count));
    }

    public async render(context: Context) {
        const handlebars = Handlebars.create();

        HandlebarsHelpers({
            handlebars
        });

        handlebars.registerHelper('upperFirst', (value: any) => _.upperFirst(value));
        handlebars.registerHelper('lowerFirst', (value: any) => _.lowerFirst(value));
        handlebars.registerHelper('repeat', (value: any, count: number) => _.repeat(value, count));
        handlebars.registerHelper('abbreviate', (value: any, options: { hash: { separator?: string }}) => _.compact(_.kebabCase(value).split('-').map(f => f[0])).map(f => f.toUpperCase() + (options.hash.separator || '')).join(''));
        handlebars.registerHelper('concat', (...values: any[]) => values.slice(0, values.length - 1).join(''));
        handlebars.registerHelper('yaml', (value: any) => Yaml.dump(value));
        handlebars.registerHelper('indentBlob', (indent: string, value: string) => {
            return value.replace(/(\r\n|\r|\n)/gm, `$1${typeof indent === 'number' ? _.repeat(' ', indent) : indent}`);
        });
        handlebars.registerHelper('---', () => '---');
        handlebars.registerHelper('uuid', (style: string) => {
            if (style === 'nodash') {
                return Uuid().replace(/-/g, '');
            }
            else {
                return Uuid();
            }
        });
        handlebars.registerHelper('normalizePath', (value: any) => Path.normalize(value));
        handlebars.registerHelper('joinPath', (...values: any[]) => Path.join(..._.compact(values.slice(0, -1))));
        handlebars.registerHelper('hash', (value: any, algorithm: string, digest: any) => Crypto.createHash(algorithm).update(value).digest(digest));

        for (const partials of this.partials) {
            const matches = await Glob.match(partials);
            for (const match of matches) {
                const partialPath = Path.resolve(match);
                const partialName = partialPath
                    .replace(partials.substring(0, partials.indexOf('*')), '')
                    .replace(partials.substring(partials.lastIndexOf('*') + 1, partials.length), '')
                    .replace(/\\/g, '/');

                const partialContent = await FS.readFile(partialPath, 'utf8');
                handlebars.registerPartial(partialName, partialContent);
            }
        }

        return Bluebird.map(this.templates, async templatePath => {
            const template = await FS.readFile(templatePath, 'utf8');
            const compiledTemplate = handlebars.compile(template, { noEscape: true });
    
            return {
                buffer: Buffer.from(compiledTemplate(context.payload), 'utf8')
            };
        });
    }
}

export const create: CreateRendererHandler = async (options, params) => {
    // const templatePath = Path.resolve(params.basePath, options.template);

    // const partialsPath = (() => {
    //     if (_.isArray(options.partials))
    //         return options.partials.map((path: string) => Path.resolve(params.basePath, path));
    //     else if (_.isString(options.partials))
    //         return [ Path.resolve(params.basePath, options.partials) ];
    // })();

    if (options.templates) {
        const templatePaths = await Bluebird
            .map(options.templates, (path: string) => resolveModuleArtifactPath(path, params.basePath))
            .map(pattern => Glob.match(pattern))
            .then(matches => _.flatten(matches));

        const promisedPartialsPath = (() => {
            if (_.isArray(options.partials))
                return Bluebird.map(options.partials, async (path: string) => resolveModuleArtifactPath(path, params.basePath));
            else if (_.isString(options.partials))
                return [ resolveModuleArtifactPath(options.partials, params.basePath) ];
        })();
        const partialsPath = promisedPartialsPath && await Bluebird.all(promisedPartialsPath);
    
        return new HandlebarsRenderer(templatePaths, partialsPath);
    }
    else {
        const templatePath = await resolveModuleArtifactPath(options.template, params.basePath);

        const promisedPartialsPath = (() => {
            if (_.isArray(options.partials))
                return Bluebird.map(options.partials, async (path: string) => resolveModuleArtifactPath(path, params.basePath));
            else if (_.isString(options.partials))
                return [ resolveModuleArtifactPath(options.partials, params.basePath) ];
        })();
        const partialsPath = promisedPartialsPath && await Bluebird.all(promisedPartialsPath);
    
        return new HandlebarsRenderer([ templatePath ], partialsPath);
    }
};
