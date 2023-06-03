type MessageID = string;

type MessageParameters = {
  message: string;
  variant?:
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'light'
  | 'dark';
  id?: MessageID;
  dismissable?: boolean;
};

const container = document.querySelector('#messages') as HTMLDivElement;
const messages: Message[] = [];

class Message {
  private element: HTMLDivElement;

  public constructor({
    message,
    variant = 'info',
    id,
    dismissable = false
  }: MessageParameters) {
    this.element = document.createElement('div');
    this.element.className = `alert alert-${variant}`;
    this.element.innerHTML = message;
    Array.from(this.element.querySelectorAll('a')).forEach(
      (a) => (a.className = `${a.className} alert-link`)
    );
    this.element.id = id || crypto.randomUUID();
    this.element.role = 'alert';
    if (dismissable) {
      this.element.classList.add('alert-dismissible');
      const button = document.createElement('button') as HTMLButtonElement;
      button.type = 'button';
      button.className = 'btn-close';
      button.dataset.bsDismiss = 'alert';
      button.ariaLabel = 'Close';
      this.element.classList.add('alert-dismissable');
      this.element.append(button);
    }
  }

  public getElement = () => this.element;

  public getId = () => this.element.id;
}

export function add(param: MessageParameters): MessageID {
  const message = new Message(param);
  messages.push(message);
  container.append(message.getElement());
  return message.getId();
}
