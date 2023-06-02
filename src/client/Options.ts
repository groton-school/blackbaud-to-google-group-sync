type OptionID = string;

type OptionParameters = {
  title: string;
  handler: () => any;
  id?: OptionID;
  primary?: boolean;
  enabled?: boolean;
};

const container = document.querySelector('#options') as HTMLElement;
const options: OptionButton[] = [];

class OptionButton {
  private element: HTMLAnchorElement;
  private enabled: boolean;

  public constructor({
    title,
    handler,
    id,
    primary = false,
    enabled = true
  }: OptionParameters) {
    this.element = document.createElement('a');
    this.element.className = 'btn';
    primary && this.element.classList.add('btn-primary');
    this.element.innerText = title;
    this.element.addEventListener('click', handler);
    this.enabled = enabled;
    this.element.id = id || crypto.randomUUID();
  }

  public getElement = () => this.element;

  public isEnabled = () => this.enabled;

  public getId = () => this.element.id;
}

export function add(param: OptionParameters): OptionID {
  const option = new OptionButton(param);
  options.push(option);
  if (option.isEnabled()) {
    container.append(option.getElement());
  }
  return option.getId();
}
