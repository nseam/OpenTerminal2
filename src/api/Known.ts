type ClassType = new(...args: any[]) => object;

export class Known {
  public static readonly Classes: Record<string, any> = {};

  public _className!: string;

  public static class(name: string): any {
    // tslint:disable-next-line:only-arrow-functions
    return function <T extends ClassType>(cls?: T) {
      if (!cls)
        // Static decorator, we don't use it.
        return;

      // tslint:disable-next-line:max-classes-per-file
      const baseClass = class extends cls {
        public _className: string = name;
        public static _className: string = name;

        constructor(...params: any[]) {
          super(...params);

        }
      };

      console.log(`Registering known class "${name}" as class of type ${cls.name}`);

      Known.Classes[name] = baseClass;
      return baseClass;
    };
  }

  // Returns registered class name of the given object or type.
  public static className(obj: any) {
    return obj._className ?? obj.constructor._className;
  }

  // Returns registered type by its FQN.
  public static get(name: string) {
    return this.Classes[name];
  }

  public static getDerivedClasses(baseClass: any): any[] {
    const derivedClasses: any[] = [];
    for (const className in this.Classes) {
      if (Object.prototype.isPrototypeOf.call(baseClass, this.Classes[className])) {
        derivedClasses.push(this.Classes[className]);
      }
    }
    return derivedClasses;
  }
}
