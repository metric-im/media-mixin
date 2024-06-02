import Component from './Component.mjs';
import {Button} from './Button.mjs';
import IdForge from './IdForge.mjs';
import API from './API.mjs';
import {InputSelect} from './InputSelect.mjs';
import {InputText,InputTextArea} from './InputText.mjs'
import InputInlineTable from './InputInlineTable.mjs';
export default class InputMultipleImages extends Component {
  constructor(props) {
    super(props);
  }
  async render(element) {
    await super.render(element);
    this.content = this.div('page-content');
    this.controls = this.div('page-controls');

    this.dropBox = this.div('drop-box',this.content);
    this.dropBox.ondrop = this.dropHandler.bind(this);
    this.dropBox.ondragover = this.dragHandler.bind(this);
    this.dropBox.onclick = await this.clickHandler.bind(this);
    await this.renderList();
    this.itemProperties = this.div('item-properties',this.content);
    this.saveButton = await this.draw(Button,{name:'save',title:'Save',onClick:this.save.bind(this)},this.controls);
    this.rotateButton = await this.draw(Button,{name:'rotate',title:'Rotate',onClick:async () => {
      let result = await API.get(`/media/image/rotate/${this.selected._id}`);
      document.querySelectorAll(`img[src*='${this.selected._id}']`).forEach(img=>{
        img.src = img.src;
      });
    }},this.controls);
    this.deleteButton = await this.draw(Button,{name:'delete',title:'Delete',onClick:async ()=> {
      if (this.selected && window.confirm('Are you you want to delete this image?')) {
        await API.remove(`/media/image/${this.selected._id}`);
        await this.renderList();
        await this.renderProperties(null);
      }
    }},this.controls);
  }
  async renderList() {
    this.dropBox.innerHTML = "";
    await this.load();
    for (let item of this.imageList) {
      let img = document.createElement('img');
      img.src = `media/image/id/${item._id}?scale=60,60,cover`;
      img.id = item._id;
      img.classList.add("fixed");
      this.dropBox.append(img);
    }
  }
  async renderProperties(id){
    this.selected = this.imageList.find((img)=>{return img._id===id});
    this.itemProperties.innerHTML = "";
    if (this.selected) {
      this.rotateButton.element.removeAttribute('disabled');
      this.deleteButton.element.removeAttribute('disabled');
      let imageContainer = this.div('properties-image-container',this.itemProperties);
      let img = document.createElement('img');
      img.src = `media/image/id/${this.selected._id}`;
      imageContainer.append(img);
      let detailsContainer = this.div('properties-details-container',this.itemProperties);
      detailsContainer.innerHTML = `<div id="image-id">id: ${this.selected._id}</div>`;
      await this.draw(InputText,{name:'description',placeholder:'name/description/keywords',data:this.selected},detailsContainer);
      this.formatTable = await this.draw(InputInlineTable,{
        name:'formatting',
        data:this.selected,
        cols:[
          {name:'name',title:'Format Name'},
          {name:'layout',title:'Layout'}
        ]
      },detailsContainer);
      let preset = await this.draw(InputSelect,{name:'preset',options:this.imagePresets,hideTitle:true},detailsContainer);
    } else {
      this.rotateButton.element.setAttribute('disabled',true);
      this.deleteButton.element.setAttribute('disabled',true);
    }
  }

  /**
   * Override this attribute as needed
   * @returns {*[]}
   */
  get imagePresets() {
    return [
      {name:'instagram',options:'scale=400,400,cover'},
      {name:'art-30x30',options:'scale=1000,1000,cover'},
      {name:'art-30x40',options:'scale=1000,1333,cover'}
    ];
  }
  async load() {
    this.imageList = await API.get(`/media/image/list/${this.props.context.id}`);
  }
  async save() {
    if (!this.selected) {
      window.toast.warning('no image selected');
      return;
    }
    try {
      if (await this.lock.test('save')) {
        await API.put(`/media/props`,{
          _id:this.selected._id,
          description:this.selected.description,
          formatting:this.selected.formatting
        });
        this.lock.clear();
        await this.load();
        window.toast.success('saved');
      }
    } catch(e) {
      console.log(e);
    }
  }
  async dropHandler(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      for (let file of event.dataTransfer.files) {
        let container = this.div('upload-container',this.dropBox)
        let img = document.createElement('img');
        img.id = IdForge.datedId();
        img.src = URL.createObjectURL(file);
        img.style.clipPath = "circle(0%)";
        container.append(img);
        container.job = new Job(this,img,file);
        await container.job.stage(img.id);
      }
    }
  }
  async clickHandler(event) {
    await this.renderProperties(event.target.id);
  }
  dragHandler(event) {
    event.preventDefault();
  }
  textHandler = async (input,text) => {
    if(input.disabled) return;
    input.disabled = true
    input.drawLoader()

    try {
      let url = text
      if(url.startsWith("http")) {
        url = url.replace(/^(http:\/\/|https:\/\/)/, "");
      }
      url = encodeURIComponent(url)

      const result = await fetch("/media/image/url/"+url, {
        method: 'GET',
      })
      if(!result.ok) throw new Error(result.status)

      const blob = await result.blob()

      input.disabled = false
      await this.fileHandler(input,blob);
    } catch(error) {
      console.error("Text handler error:", error)
      window.toast.error("Something went wrong")

      input.disabled = false
      this.drawImageRender()
    }
  }
  fileHandler = async (input,file) => {
    if(!file || input.disabled) return;
    if(!file.type.startsWith("image/")) {
      this.drawImageRender()
      window.toast.error("Unknown file type")
      return;
    }

    input.disabled = true
    input.drawLoader()

    let success = false
    try {
      await this.uploadImage(file)
      success = true
    } catch(error) {
      console.error("Upload image error:", error)
      window.toast.error("Something went wrong")
    }

    input.disabled = false

    if(success) {
      await this.updateImage()
    } else {
      this.drawImageRender()
    }
  }
  drawImageRender() {
    if(this.imageRender) {
      this.inputFile.drawContent(this.imageRender);
    } else {
      this.inputFile.drawContent("");
    }
  }
  async updateItem(id) {
    let item = await API.get(`/media/props/${id}`);
    let found = false;
    let i = 0;
    for (let entry of this.imageList) {
      if (entry._id === item._id) {
        this.imageList.splice(i,1,item);
        break;
      } else i++;
    }
    if (i >= this.imageList.length) this.imageList.push(item);
    let root = id.match(/\/(.+)\./)
    if (root) root = root[1];
    else return;
    this.element.querySelectorAll(`IMG[id*='${root}']`).forEach(img=>{
      img.src = item.url;
      img.id = item._id;
    })
  }
}

class Job {
  constructor(parent,element,file) {
    this.parent = parent;
    this.element = element;
    this.file = file;
    this.status = Job.NEW;
  }
  static NEW = 1;
  static UPLOAD = 2;
  static FAILED = 3;
  static SUCCESS = 4;
  static COMPLETE = 5;

  /**
   * An upload is first staged to declare the metadata and track progress.
   * @returns {Promise<void>}
   */
  async stage(id) {
    let body = {
      _id:`${this.parent.props.context.id}/${id}.image`,
      type: this.file.type,
      size: this.file.size,
      captured: this.file.lastModified,
      formatting:[{name:'original',layout:''}],
      account:this.parent.props.context.id
    }
    // let options = {
    //   method: 'PUT',
    //   credentials: 'same-origin',
    //   headers: {'Content-Type': 'application/json'},
    //   body: JSON.stringify(body)
    // };
    try {
      let response = await API.put(`/media/props`, body);
      this.status = Job.UPLOAD;
      await this.upload(response);
    } catch(e) {
      this.status = Job.FAILED;
      window.toast.error("something went wrong: " + response.message);
    }
  }

  async upload(stageResult) {
    try {
      let formData = new FormData();
      formData.append('file',this.file);

      let xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        let progress = ((e.loaded / e.total) * 100);
        this.element.style.clipPath = `circle(${progress}%)`;
      };
      let options = this.parent.props.options?`?${this.parent.props.options}`:'';
      xhr.open("PUT", "/media/upload/" + stageResult._id + options);
      xhr.send(formData);
      xhr.onload = async (e) => {
        this.status = Job.SUCCESS;
        await this.parent.updateItem(stageResult._id)
      };
    } catch(error) {
      this.status = Job.FAILED;
      window.toast.error("something went wrong: " + error);
    }
  }
}
