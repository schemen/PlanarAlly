import gameManager from "../planarally";
import { getMouse } from "../utils";
import { l2g } from "../units";
import Settings from "../settings";
import { socket } from "../socket";

export function onPointerDown(e: MouseEvent) {
    if (!Settings.board_initialised) return;
    if (e.button == 1) {
        const panTool = gameManager.tools.get("pan");
        if (panTool !== undefined) {
            panTool.onMouseDown(e);
        }
    }
    if ((e.button !== 0) || (<HTMLElement>e.target).tagName !== 'CANVAS') return;
    document.getElementById("contextMenu")!.style.display = 'none';
    gameManager.tools.getIndexValue(gameManager.selectedTool)!.onMouseDown(e);
}

export function onPointerMove(e: MouseEvent) {
    if (!Settings.board_initialised) return;
    if ((e.buttons & 4) !== 0) {
        const panTool = gameManager.tools.get("pan");
        if (panTool !== undefined) {
            panTool.onMouseMove(e);
        }
    }
    if (((e.buttons & 1) > 1) || (<HTMLElement>e.target).tagName !== 'CANVAS') return;
    gameManager.tools.getIndexValue(gameManager.selectedTool)!.onMouseMove(e);
    // Annotation hover
    let found = false;
    for (let i = 0; i < gameManager.annotations.length; i++) {
        const uuid = gameManager.annotations[i];
        if (gameManager.layerManager.UUIDMap.has(uuid) && gameManager.layerManager.hasLayer("draw")) {
            const draw_layer = gameManager.layerManager.getLayer("draw")!;
            const shape = gameManager.layerManager.UUIDMap.get(uuid)!;
            if (shape.contains(l2g(getMouse(e)))) {
                found = true;
                gameManager.annotationManager.setActiveText(shape.annotation);
            }
        }
    }
    if (!found && gameManager.annotationManager.shown) {
        gameManager.annotationManager.setActiveText('');
    }
}

export function onPointerUp(e: MouseEvent) {
    if (!Settings.board_initialised) return;
    if (e.button == 1) {
        const panTool = gameManager.tools.get("pan");
        if (panTool !== undefined) {
            panTool.onMouseUp(e);
        }
    }
    if ((e.button !== 0 && e.button !== 1) || (<HTMLElement>e.target).tagName !== 'CANVAS') return;
    gameManager.tools.getIndexValue(gameManager.selectedTool)!.onMouseUp(e);
}

export function onContextMenu(e: MouseEvent) {
    if (!Settings.board_initialised) return;
    if (e.button !== 2) return;
    if ((<HTMLElement>e.target).tagName === 'CANVAS') {
        gameManager.tools.getIndexValue(gameManager.selectedTool)!.onContextMenu(e);
    } else if ((<HTMLElement>e.target).className.split(" ").includes("token")) {
        const src = (<HTMLElement>e.target).querySelector("img")!.src;
        const $menu = $('#contextMenu');
        $menu.empty();
        $menu.show();
        $menu.css({ left: e.pageX, top: e.pageY });
        let data = "<ul>";
        data += "<li data-action='showToPlayers' class='context-clickable'>Show to players</li>";
        data += "</ul>";
        $menu.html(data);
        $(".context-clickable").on('click', function () {
            const action = $(this).data("action");
            switch (action) {
                case 'showToPlayers':
                    socket.emit("showAssetToPlayers", {src: src});
                    break;
            }
            $menu.hide();
        });
    } else {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
}

export function scrollZoom(e: WheelEvent) {
    if (!e.target || !(<HTMLElement>e.target).tagName || (<HTMLElement>e.target).tagName !== 'CANVAS') return;
    let delta: number;
    if (e.wheelDelta) {
        delta = Math.sign(e.wheelDelta) * 1;
    } else {
        delta = Math.sign(e.deltaY) * -1;
    }
    Settings.updateZoom(Settings.zoomFactor + 0.1 * delta, l2g(getMouse(e)));
}