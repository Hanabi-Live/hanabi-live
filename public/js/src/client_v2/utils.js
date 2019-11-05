export function makeArray(obj) {
    if (!Array.isArray(obj)) {
        return [obj];
    }
    return obj;
}

export function transformToExitContainer(obj, cont) {
    const sinRot = Math.sin(-cont.rotation);
    const cosRot = Math.cos(-cont.rotation);
    const { x, y } = obj;
    obj.x = (x * cosRot) + (y * sinRot);
    obj.y = (y * cosRot) - (x * sinRot);
    obj.x += cont.x;
    obj.y += cont.y;
}

export function transformToEnterContainer(obj, cont) {
    obj.x -= cont.x;
    obj.y -= cont.y;
    const sinRot = Math.sin(cont.rotation);
    const cosRot = Math.cos(cont.rotation);
    const { x, y } = obj;
    obj.x = (x * cosRot) + (y * sinRot);
    obj.y = (y * cosRot) - (x * sinRot);
}
