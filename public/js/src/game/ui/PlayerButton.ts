// Imports
import Konva from 'konva';
import Button from './Button';

export default class PlayerButton extends Button {
    targetIndex: number;

    constructor(config: Konva.ContainerConfig, targetIndex: number) {
        super(config, []);
        this.targetIndex = targetIndex;
    }
}
