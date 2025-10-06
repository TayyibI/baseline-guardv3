// If baseline is "2020", these might fail:

// Too new - Array.at() (2021)
const lastItem = array.at(-1);

// Too new - Private class fields (2021) 
class MyClass {
  #privateField = 42;
}

// Too new - Promise.any() (2021)
Promise.any(promises);

// Too new - String.replaceAll() (2021)
"hello".replaceAll("l", "x");