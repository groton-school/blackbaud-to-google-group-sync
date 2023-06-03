import './styles.scss';

type OptionID = string;

type OptionParameters = {
  title: string;
  handler: () => any;
  id?: OptionID;
  primary?: boolean;
  enabled?: boolean;
  variant?:
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'light'
  | 'dark'
  | 'link';
};

const container = document.querySelector('#options') as HTMLElement;
const options: OptionButton[] = [];

class OptionButton {
  private element: HTMLButtonElement;

  public constructor({
    title,
    handler,
    id,
    primary = false,
    enabled = true,
    variant = 'light'
  }: OptionParameters) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    primary && (variant = 'primary');
    this.element.className = `btn btn-${variant}`;
    this.element.innerText = title;
    this.element.addEventListener('click', handler);
    this.element.disabled = !enabled;
    this.element.id = id || crypto.randomUUID();
  }

  public getElement = () => this.element;

  public getId = () => this.element.id;
}

export function add(param: OptionParameters): HTMLButtonElement {
  const option = new OptionButton(param);
  options.push(option);
  container.append(option.getElement());
  return option.getElement();
}
