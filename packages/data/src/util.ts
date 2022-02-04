export function isObjectEqual<T>(object1: T, object2: T): boolean {
  // First, check to see if all of the properties match
  for (const key of Object.keys(object1)) {
    const propertyName = key as keyof T;
    const property1 = object1[propertyName];
    const property2 = object2[propertyName];
    if (property1 !== property2) {
      return false;
    }
  }

  return true;
}
