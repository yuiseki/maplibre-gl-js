import {describe, beforeEach, test, expect, vi} from 'vitest';
import {CanvasSource} from '../source/canvas_source';
import {type IReadonlyTransform} from '../geo/transform_interface';
import {Event, Evented} from '../util/evented';
import {extend} from '../util/util';

import type {Dispatcher} from '../util/dispatcher';
import {Tile} from './tile';
import {OverscaledTileID} from './tile_id';
import {MercatorTransform} from '../geo/projection/mercator_transform';

function createSource(options?) {
    const c = options && options.canvas || window.document.createElement('canvas');
    c.width = 20;
    c.height = 20;

    options = extend({
        canvas: 'id',
        coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]],
    }, options);

    const source = new CanvasSource('id', options, {} as Dispatcher, options.eventedParent);

    source.canvas = c;

    return source;
}

class StubMap extends Evented {
    transform: IReadonlyTransform;
    style: any;
    painter: any;

    constructor() {
        super();
        this.transform = new MercatorTransform();
        this.style = {};
        this.painter = {
            context: {
                gl: {}
            }
        };
    }

    triggerRepaint() {
        this.fire(new Event('rerender'));
    }
}

describe('CanvasSource', () => {
    let map;
    beforeEach(() => {
        map = new StubMap();
    });

    test('constructor', () => new Promise<void>(done => {
        const source = createSource();

        expect(source.minzoom).toBe(0);
        expect(source.maxzoom).toBe(22);
        expect(source.tileSize).toBe(512);
        expect(source.animate).toBe(true);
        source.on('data', (e) => {
            if (e.dataType === 'source' && e.sourceDataType === 'metadata') {
                expect(typeof source.play).toBe('function');
                done();
            }
        });

        source.onAdd(map);
    }));

    test('self-validates', () => {
        const stub = vi.spyOn(console, 'error').mockImplementation(() => {});
        createSource({coordinates: []});
        expect(stub).toHaveBeenCalled();
        stub.mockReset();

        createSource({coordinates: 'asdf'});
        expect(stub).toHaveBeenCalled();
        stub.mockReset();

        createSource({animate: 8});
        expect(stub).toHaveBeenCalled();
        stub.mockReset();

        createSource({canvas: {}});
        expect(stub).toHaveBeenCalled();
        stub.mockReset();

        const canvasEl = window.document.createElement('canvas');
        createSource({canvas: canvasEl});
        expect(stub).not.toHaveBeenCalled();
        stub.mockReset();

    });

    test('can be initialized with HTML element', () => new Promise<void>(done => {
        const el = window.document.createElement('canvas');
        const source = createSource({
            canvas: el
        });

        source.on('data', (e) => {
            if (e.dataType === 'source' && e.sourceDataType === 'metadata') {
                expect(source.canvas).toBe(el);
                done();
            }
        });

        source.onAdd(map);
    }));

    test('rerenders if animated', () => new Promise<void>(done => {
        const source = createSource();

        map.on('rerender', () => {
            expect(true).toBeTruthy();
            done();
        });

        source.onAdd(map);
    }));

    test('can be static', () => new Promise<void>(done => {
        const source = createSource({
            animate: false
        });

        map.on('rerender', () => {
            // this just confirms it didn't happen, so no need to run done() here
            // if called the test will fail
            expect(true).toBeFalsy();
        });

        source.on('data', (e) => {
            if (e.sourceDataType === 'metadata' && e.dataType === 'source') {
                expect(true).toBeTruthy();
                done();
            }
        });

        source.onAdd(map);
    }));

    test('onRemove stops animation', () => {
        const source = createSource();

        source.onAdd(map);

        expect(source.hasTransition()).toBe(true);

        source.onRemove();

        expect(source.hasTransition()).toBe(false);

        source.onAdd(map);

        expect(source.hasTransition()).toBe(true);

    });

    test('play and pause animation', () => {
        const source = createSource();

        source.onAdd(map);

        expect(source.hasTransition()).toBe(true);

        source.pause();

        expect(source.hasTransition()).toBe(false);

        source.play();

        expect(source.hasTransition()).toBe(true);

    });

    test('fires idle event on prepare call when there is at least one not loaded tile', () => new Promise<void>(done => {
        const source = createSource();
        const tile = new Tile(new OverscaledTileID(1, 0, 1, 0, 0), 512);
        source.on('data', (e) => {
            if (e.dataType === 'source' && e.sourceDataType === 'idle') {
                expect(tile.state).toBe('loaded');
                done();
            }
        });
        source.onAdd(map);

        source.tiles[String(tile.tileID.wrap)] = tile;
        // assign dummies directly so we don't need to stub the gl things
        source.texture = {
            update: () => {}
        } as any;
        source.prepare();
    }));

});

test('CanvasSource#serialize', () => {
    const source = createSource();

    const serialized = source.serialize();
    expect(serialized.type).toBe('canvas');
    expect(serialized.coordinates).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);

});
