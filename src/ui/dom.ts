type Child = Node | string | null | undefined | false;

type Props<K extends keyof HTMLElementTagNameMap> = Partial<
  Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>
> & {
  class?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
};

/** Creates an element with properties and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { class: className, dataset, attrs, ...rest } = props;
  if (className !== undefined) element.className = className;
  Object.assign(element, rest);
  if (dataset !== undefined) Object.assign(element.dataset, dataset);
  if (attrs !== undefined) {
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/** Returns the element with the given id. Throws when it does not exist. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Element #${id} not found`);
  return element as T;
}

export function show(element: HTMLElement, visible: boolean): void {
  element.hidden = !visible;
}

/** Calls the function at most one time in each interval. The last call always runs. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    const wait = ms - (Date.now() - last);
    clearTimeout(timer);
    if (wait <= 0) {
      last = Date.now();
      fn(...args);
    } else {
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, wait);
    }
  };
}
