import Component from './Component.mjs';

export default class ImageEditor extends Component {
    constructor(props) {
        super(props);
        this.id = this.props.id;
    }
    async render(element) {
        await super.render(element);
        this.baseImage = document.createElement('img');
        this.baseImage.classList.add('base-image')
        this.baseImage.src = `/media/image/id/${this.id}`;
        this.element.append(this.baseImage);
        this.cropImage = document.createElement('img');
        this.cropImage.classList.add('crop-image')
        this.cropImage.src = `/media/image/id/${this.id}`;
        this.element.append(this.cropImage);
        // this.cropImage.style.clipPath="rect(50% 50%)";
        // this.element.append(this.cropImage);
        // this.sizer = this.div('image-crop-sizer');
        // this.element.append(this.sizer);

        // let imageContainer = this.div('properties-image-container',this.itemProperties);
        // imageContainer.innerHTML = 'Loading...';
        // let img = document.createElement('img');
        // img.src = `media/image/id/${this.props.context.id}/${id}`;
        // img.onclick = (e)=>window.open(img.src,'media');
        // imageContainer.append(img);
    }
}