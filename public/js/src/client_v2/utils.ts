export function makeArray(obj: any) {
    if (!Array.isArray(obj)) {
        return [obj];
    }
    return obj;
}

export function transformToExitContainer(obj: any, cont: any) {
    const sinRot = Math.sin(-cont.rotation);
    const cosRot = Math.cos(-cont.rotation);
    const { x, y } = obj;
    obj.x = (x * cosRot) + (y * sinRot);
    obj.y = (y * cosRot) - (x * sinRot);
    obj.x += cont.x;
    obj.y += cont.y;
}

export function transformToEnterContainer(obj: any, cont: any) {
    obj.x -= cont.x;
    obj.y -= cont.y;
    const sinRot = Math.sin(cont.rotation);
    const cosRot = Math.cos(cont.rotation);
    const { x, y } = obj;
    obj.x = (x * cosRot) + (y * sinRot);
    obj.y = (y * cosRot) - (x * sinRot);
}
