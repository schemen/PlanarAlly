import gameManager from "../manager";
import store from "../store";
import BoundingRect from "./boundingrect";

import * as tinycolor from "tinycolor2";
import { uuidv4 } from "../../core/utils";
import { aurasFromServer, aurasToServer } from "../comm/conversion/aura";
import { socket } from "../comm/socket";
import { InitiativeData } from "../comm/types/general";
import { ServerShape } from "../comm/types/shapes";
import { GlobalPoint, LocalPoint } from "../geom";
import { g2l, g2lr, g2lx, g2ly, g2lz } from "../units";

export default abstract class Shape {
    // Used to create class instance from server shape data
    protected abstract type: string;
    // The unique ID of this shape
    uuid: string;
    // The layer the shape is currently on
    layer!: string;

    // A reference point regarding that specific shape's structure
    refPoint: GlobalPoint;

    // Fill colour of the shape
    fillColour: string = "#000";
    strokeColour: string = "rgba(0,0,0,0)";
    // The optional name associated with the shape
    name = "Unknown shape";

    // Associated trackers/auras/owners
    trackers: Tracker[] = [];
    auras: Aura[] = [];
    owners: string[] = [];

    // Block light sources
    visionObstruction = false;
    // Prevent shapes from overlapping with this shape
    movementObstruction = false;
    // Does this shape represent a playable token
    isToken = false;
    // Show a highlight box
    showHighlight = false;

    // Mouseover annotation
    annotation: string = "";

    // Draw modus to use
    globalCompositeOperation: string = "source-over";

    // Additional options for specialized uses
    options: Map<string, any> = new Map();

    constructor(refPoint: GlobalPoint, fillColour?: string, strokeColour?: string, uuid?: string) {
        this.refPoint = refPoint;
        this.uuid = uuid || uuidv4();
        if (fillColour !== undefined) this.fillColour = fillColour;
        if (strokeColour !== undefined) this.strokeColour = strokeColour;
    }

    abstract getBoundingBox(): BoundingRect;

    // If inWorldCoord is
    abstract contains(point: GlobalPoint): boolean;

    abstract center(): GlobalPoint;
    abstract center(centerPoint: GlobalPoint): void;
    abstract getCorner(point: GlobalPoint): string | undefined;
    abstract visibleInCanvas(canvas: HTMLCanvasElement): boolean;

    // Code to snap a shape to the grid
    // This is shape dependent as the shape refPoints are shape specific in
    abstract snapToGrid(): void;
    abstract resizeToGrid(): void;
    abstract resize(resizeDir: string, point: LocalPoint): void;

    invalidate(skipLightUpdate: boolean) {
        const l = gameManager.layerManager.getLayer(this.layer);
        if (l) l.invalidate(skipLightUpdate);
    }

    checkVisionSources() {
        const self = this;
        const obstructionIndex = gameManager.visionBlockers.indexOf(this.uuid);
        let changeBV = false;
        if (this.visionObstruction && obstructionIndex === -1) {
            gameManager.visionBlockers.push(this.uuid);
            changeBV = true;
        } else if (!this.visionObstruction && obstructionIndex >= 0) {
            gameManager.visionBlockers.splice(obstructionIndex, 1);
            changeBV = true;
        }
        if (changeBV) gameManager.recalculateBoundingVolume();

        // Check if the visionsource auras are in the gameManager
        this.auras.forEach(au => {
            const ls = gameManager.visionSources;
            const i = ls.findIndex(o => o.aura === au.uuid);
            if (au.visionSource && i === -1) {
                ls.push({ shape: self.uuid, aura: au.uuid });
            } else if (!au.visionSource && i >= 0) {
                ls.splice(i, 1);
            }
        });
        // Check if anything in the gameManager referencing this shape is in fact still a visionsource
        for (let i = gameManager.visionSources.length - 1; i >= 0; i--) {
            const ls = gameManager.visionSources[i];
            if (ls.shape === self.uuid) {
                if (!self.auras.some(a => a.uuid === ls.aura && a.visionSource)) gameManager.visionSources.splice(i, 1);
            }
        }
    }

    setMovementBlock(blocksMovement: boolean) {
        this.movementObstruction = blocksMovement || false;
        const obstructionIndex = gameManager.movementblockers.indexOf(this.uuid);
        if (this.movementObstruction && obstructionIndex === -1) gameManager.movementblockers.push(this.uuid);
        else if (!this.movementObstruction && obstructionIndex >= 0)
            gameManager.movementblockers.splice(obstructionIndex, 1);
    }

    setIsToken(isToken: boolean) {
        this.isToken = isToken;
        if (this.ownedBy()) {
            const i = gameManager.ownedtokens.indexOf(this.uuid);
            if (this.isToken && i === -1) gameManager.ownedtokens.push(this.uuid);
            else if (!this.isToken && i >= 0) gameManager.ownedtokens.splice(i, 1);
        }
    }

    ownedBy(username?: string) {
        if (username === undefined) username = store.state.username;
        return store.state.IS_DM || this.owners.includes(username);
    }

    abstract asDict(): ServerShape;
    getBaseDict(): ServerShape {
        return {
            type_: this.type,
            uuid: this.uuid,
            x: this.refPoint.x,
            y: this.refPoint.y,
            layer: this.layer,
            draw_operator: this.globalCompositeOperation,
            movement_obstruction: this.movementObstruction,
            vision_obstruction: this.visionObstruction,
            auras: aurasToServer(this.auras),
            trackers: this.trackers,
            owners: this.owners,
            fill_colour: this.fillColour,
            stroke_colour: this.strokeColour,
            name: this.name,
            annotation: this.annotation,
            is_token: this.isToken,
            options: JSON.stringify([...this.options]),
        };
    }
    fromDict(data: ServerShape) {
        this.layer = data.layer;
        this.globalCompositeOperation = data.draw_operator;
        this.movementObstruction = data.movement_obstruction;
        this.visionObstruction = data.vision_obstruction;
        this.auras = aurasFromServer(data.auras);
        this.trackers = data.trackers;
        this.owners = data.owners;
        this.isToken = data.is_token;
        if (data.annotation) this.annotation = data.annotation;
        if (data.name) this.name = data.name;
        if (data.options) this.options = new Map(JSON.parse(data.options));
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.globalCompositeOperation !== undefined) ctx.globalCompositeOperation = this.globalCompositeOperation;
        else ctx.globalCompositeOperation = "source-over";
        if (this.showHighlight) {
            const bbox = this.getBoundingBox();
            ctx.strokeStyle = "red";
            ctx.strokeRect(g2lx(bbox.topLeft.x) - 5, g2ly(bbox.topLeft.y) - 5, g2lz(bbox.w) + 10, g2lz(bbox.h) + 10);
        }
    }

    drawAuras(ctx: CanvasRenderingContext2D) {
        for (const aura of this.auras) {
            if (aura.value === 0 && aura.dim === 0) return;
            ctx.beginPath();

            const loc = g2l(this.center());
            const innerRange = g2lr(aura.value + aura.dim);

            if (aura.dim === 0) ctx.fillStyle = aura.colour;
            else {
                const gradient = ctx.createRadialGradient(
                    loc.x,
                    loc.y,
                    g2lr(aura.value),
                    loc.x,
                    loc.y,
                    g2lr(aura.value + aura.dim),
                );
                const tc = tinycolor(aura.colour);
                ctx.fillStyle = gradient;
                gradient.addColorStop(0, aura.colour);
                gradient.addColorStop(1, tc.setAlpha(0).toRgbString());
            }
            if (!aura.visionSource || aura.lastPath === undefined) {
                ctx.arc(loc.x, loc.y, innerRange, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                try {
                    ctx.fill(aura.lastPath);
                } catch (e) {
                    ctx.arc(loc.x, loc.y, innerRange, 0, 2 * Math.PI);
                    ctx.fill();
                    console.warn(e);
                }
            }
        }
    }

    getInitiativeRepr(): InitiativeData {
        return {
            uuid: this.uuid,
            visible: !store.state.IS_DM,
            group: false,
            source: this.name,
            has_img: false,
            effects: [],
            index: Infinity,
        };
    }

    moveLayer(layer: string, sync: boolean) {
        const oldLayer = gameManager.layerManager.getLayer(this.layer);
        const newLayer = gameManager.layerManager.getLayer(layer);
        if (oldLayer === undefined || newLayer === undefined) return;
        this.layer = layer;
        // Update layer shapes
        oldLayer.shapes.splice(oldLayer.shapes.indexOf(this), 1);
        newLayer.shapes.push(this);
        // Revalidate layers  (light should at most be redone once)
        oldLayer.invalidate(true);
        newLayer.invalidate(false);
        // Sync!
        if (sync) socket.emit("Shape.Layer.Change", { uuid: this.uuid, layer });
    }
}
