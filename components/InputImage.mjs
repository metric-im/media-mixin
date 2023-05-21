import Component from "./Component.mjs";
import InputFile from "./InputFile.mjs";
export default class InputImage extends Component {
  constructor(props) {
    super(props);
    this.server = this.props.server || 'aws'; // default to S3, the other option is 'storj'
  }
  async render(element) {
    await super.render(element);
    this.imageBox = this.div('input-image');
    this.formBody = this.div('form-body',this.imageBox);
    this.progressDisplay = this.div('progress-display',this.formBody);
    this.inputFile = await this.draw(InputFile,{data:this.props.data,name:"icon",title:this.props.title,accept:"image/*"},this.formBody);
  }
  get value() {
    return this.inputFile.value;
  }
  static jobs = [];
  async save() {
    let job = new Job(this);
    job.draw(this.progressDisplay);
    await job.stage();
    InputImage.jobs.push(job);
  }

  updateJobs() {
    this.progressDisplay.innerHTML = "";
    for (let job of Upload.jobs) {
      this.progressDisplay.innerHTML += `<div>${job.id}</div>`;
    }
  }
}
class Job {
  constructor(parent) {
    this.parent = parent;
    this.status = Job.NEW;
  }
  static NEW = 1;
  static UPLOAD = 2;
  static FAILED = 3;
  static SUCCESS = 4;
  static COMPLETE = 5;

  draw(hostElement) {
    this.element = document.createElement("div");
    this.element.classList.add('job');
    this.element.innerHTML = this.parent.inputFile.value.name;
    this.progressBar = document.createElement("div")
    this.progressBar.classList.add('progress');
    this.element.append(this.progressBar);
    hostElement.append(this.element);
  }
  destroy(wait=1000) {
    this.progressBar.style.backgroundColor = "red";
    setTimeout(()=>{
      this.element.remove();
      this.status = Job.COMPLETE;
    },wait)
  }

  /**
   * An upload is first staged to declare the metadata and receive an id.
   * @returns {Promise<void>}
   */
  async stage() {
    let body = {
      type: this.parent.inputFile.value.type,
      size: this.parent.inputFile.value.size,
      captured: this.parent.inputFile.value.lastModified
    }
    let options = {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    };
    let response = await fetch(`/media/stage/${this.parent.server}`, options);
    let result = await response.json();
    if (response.ok) {
      this.status = Job.UPLOAD;
      await this.upload(result);
    } else {
      this.status = Job.FAILED;
      window.toast.error("something went wrong: " + result.message);
      this.destroy(2000);
    }
  }

  async upload(stageResult) {
    try {
      let formData = new FormData();
      formData.append('file',this.parent.inputFile.value);

      let xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        this.progressBar.style.left = ((e.loaded / e.total) * 100)+"%";
      };
      xhr.open("PUT", "/media/upload/" + stageResult._id);
      xhr.send(formData);
      xhr.onload = (e) => {
        this.status = Job.SUCCESS;
        this.destroy();
      };
    } catch(error) {
      window.toast.error("something went wrong: " + error);
    }
  }
}

