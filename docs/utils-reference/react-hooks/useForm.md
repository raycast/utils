# `useForm`

Hook that will return all Form state and helpers directly.
It is a wrapper around the Form API and provides a simple way to use such things like form validation or controlled form items.

Controlling form items is easy with the hook. Simply pass the value to the `setValue()` function and the Form will update the value.
It will automatically update the form validation state when the form is submitted. You can easily use the hook's validation state to render error messages automatically.

## Signature

```ts
function useForm<T extends Form.Values>(props: {
  onSubmit: (values: T) => void | boolean | Promise<void | boolean>;
  initialValues?: Partial<T>;
  validation?: Validation<T>;
}): FormProps<T>;
```

### Arguments

- `onSubmit` - is a callback that will be called when the form is submitted and all validations pass.

With a few options:

- `initialValues` - initial values of the form.
- `validation` - validation rules for the form.

### Return

Returns an object with the [FormProps](#formprops) contains the form state and methods that will be returned to the consumer of the `useHook`.

## Example

```tsx
import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";

interface SignUpFormValues {
  firstName: string;
  lastName: string;
  birthday: Date;
  password: string;
  number: string;
  hobbies: string[];
}

export default function Main() {
  const { handleSubmit, itemProps } = useForm<SignUpFormValues>({
    onSubmit(values) {
      showToast({
        style: Toast.Style.Success,
        title: "Yay!",
        message: `${values.firstName} ${values.lastName} account created`
      });
    },
    validation: {
      firstName: FormValidation.Required,
      lastName: FormValidation.Required,
      birthday: FormValidation.Required,
      password: (value) => {
        if (value && value.length < 8) {
          return "Password must be at least 8 symbols";
        } else if (!value) {
          return "The item is required";
        }
      },
      number: (value) => {
        if (value && value !== "2") {
          return "Please select '2'";
        }
      },
    },
  });
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="First Name" placeholder="Enter first name" {...itemProps.firstName} />
      <Form.TextField title="Last Name" placeholder="Enter last name" {...itemProps.lastName} />
      <Form.DatePicker title="Date of Birth" {...itemProps.birthday} />
      <Form.PasswordField
        title="Password"
        placeholder="Enter password at least 8 characters long"
        {...itemProps.password}
      />
      <Form.Dropdown title="Your Favorite Number" {...itemProps.number}>
        {[1, 2, 3, 4, 5, 6, 7].map((num) => {
          return <Form.Dropdown.Item value={String(num)} title={String(num)} key={num} />;
        })}
      </Form.Dropdown>
    </Form>
  );
}
```

## Types

### FormProps

Form state and methods that will be returned to the consumer of the `useHook`.
This is the internal state of the form and is not intended to be used directly.

```tsx
interface FormProps<T extends Form.Values> {
  handleSubmit: (values: T) => void | boolean | Promise<void | boolean>;
  setValidationError: (id: keyof T, error: ValidationError) => void;
  setValue: <K extends keyof T>(id: K, value: T[K]) => void;
  values: T;
  itemProps: {
    [id in keyof T]: Partial<Form.ItemProps<T[id]>> & {
      id: string;
    };
  };
}
```

- `handleSubmit` - function that will be called when the form is submitted. Use it to pass into the `onSubmit` prop of the `<Action.SubmitForm>` element.
- `setValidationError` - function that you should use to configure the validation error for a specific field.
- `setValue` - function that you should use to set the value for a specific field.
- `values` - the current values of the form.
- `itemProps` - the props that will be passed to the `<Form.Item>` element.
