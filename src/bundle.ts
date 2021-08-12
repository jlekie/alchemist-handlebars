import * as Handlebars from 'handlebars';
import * as HandlebarsHelpers from 'handlebars-helpers';
import * as Bluebird from 'bluebird';
import * as FS from 'fs-extra';
import * as Path from 'path';

import * as _ from 'lodash';

import { CreateRendererHandler, ARenderer, Context } from '@jlekie/alchemist';

import * as Glob from './lib/globAsync';

export interface BundleManifest {
    path: string;
}

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

export class HandlebarsBundleRenderer extends ARenderer {
    public readonly template: string;
    public readonly partials: string[];

    // private readonly handlebars: typeof Handlebars;

    public constructor(template: string, partials?: string[]) {
        super();

        this.template = template;
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

        const template = await FS.readFile(this.template, 'utf8');
        const compiledTemplate = handlebars.compile(template, { noEscape: true });

        return Buffer.from(compiledTemplate(context.payload), 'utf8');
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

    const templatePath = await resolveModuleArtifactPath(options.template, params.basePath);

    const promisedPartialsPath = (() => {
        if (_.isArray(options.partials))
            return Bluebird.map(options.partials, async (path: string) => resolveModuleArtifactPath(path, params.basePath));
        else if (_.isString(options.partials))
            return [ resolveModuleArtifactPath(options.partials, params.basePath) ];
    })();
    const partialsPath = promisedPartialsPath && await Bluebird.all(promisedPartialsPath);

    return new HandlebarsBundleRenderer(templatePath, partialsPath);
};