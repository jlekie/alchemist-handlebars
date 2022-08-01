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

export class InlineRenderer extends ARenderer {
    public readonly outputs: Array<{ path: string, template: string }>;

    public constructor(outputs: Array<{ path: string, template: string }>) {
        super();

        this.outputs = outputs;
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
        handlebars.registerHelper('---', () => '---');
        handlebars.registerHelper('uuid', (style: string) => {
            if (style === 'nodash') {
                return Uuid().replace(/-/g, '');
            }
            else {
                return Uuid();
            }
        });
        handlebars.registerHelper('hash', (value: any, algorithm: string, digest: any) => Crypto.createHash(algorithm).update(value).digest(digest));

        return Bluebird.map(this.outputs, async ({ path, template }) => {
            const compiledTemplate = handlebars.compile(template, { noEscape: true });

            return {
                qualifier: path,
                buffer: Buffer.from(compiledTemplate(context.payload), 'utf8')
            };
        });
    }
}

export const create: CreateRendererHandler = async (options, params) => {
    const outputs = _.map(options.outputs, (template, key) => ({
        path: key,
        template
    }));

    return new InlineRenderer(outputs);
};
