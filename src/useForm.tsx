import { Form } from "@raycast/api";
import { useState, useCallback, useMemo, useRef } from "react";
import { useLatest } from "./useLatest";

/**
 * A enum describing the built-in validation types
 * - Required: the value is required
 */
export enum FormValidation {
  Required = "required",
}

type ValidationError = string | undefined | null;
type Validator<ValueType> = ((value: ValueType | undefined) => ValidationError) | FormValidation;

function validationError<ValueType>(
  validation: Validator<ValueType> | undefined,
  value: ValueType | undefined
): ValidationError {
  if (validation) {
    if (typeof validation === "function") {
      return validation(value);
    } else if (validation === FormValidation.Required) {
      let valueIsValid = typeof value !== "undefined" && value !== null;
      if (valueIsValid) {
        switch (typeof value) {
          case "string":
            valueIsValid = value.length > 0;
            break;
          case "object":
            if (Array.isArray(value)) {
              valueIsValid = value.length > 0;
            } else if (value instanceof Date) {
              valueIsValid = value.getTime() > 0;
            }
            break;
          default:
            break;
        }
      }
      if (!valueIsValid) {
        return "The item is required";
      }
    }
  }
}

type Validation<T extends Form.Values> = { [id in keyof T]?: Validator<T[id]> };

/**
 * Form state and methods that will be returned to the consumer of the `useHook`.
 */
interface FormProps<T extends Form.Values> {
  /** Function that will be called when the form is submitted. Use it to pass into the `onSubmit` prop of the `<Action.SubmitForm>` element. */
  handleSubmit: (values: T) => void | boolean | Promise<void | boolean>;
  /** Function that you should use to configure the validation error for a specific field. */
  setValidationError: (id: keyof T, error: ValidationError) => void;
  /** Function that you should use to set the value for a specific field. */
  setValue: <K extends keyof T>(id: K, value: T[K]) => void;
  /** The current values of the form. */
  values: T;
  /** The props that will be passed to the `<Form.Item>` element. */
  itemProps: {
    [id in keyof T]: Partial<Form.ItemProps<T[id]>> & {
      id: string;
    };
  };
}

/**
 * `useForm()` is a custom React hook that will return all Form state and helpers directly.
 * It is a wrapper around the Form API and provides a simple way to use such things like form validation or controlled form items.
 *
 * Controlling form items is easy with the hook. Simply pass the value to the `setValue()` function and the Form will update the value.
 * It will automatically update the form validation state when the form is submitted.
 * You can easily use the hook's validation state to render error messages automatically.
 *
 *
 * @returns Form state and helpers. See {@link FormProps} for more details.
 *
 * @example
 * ```
 * import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
 * import { useForm, FormValidation } from "@raycast/utils";
 *
 * interface SignUpFormValues {
 *   nickname: string;
 *   password: string;
 * }
 *
 * export default function Main() {
 *   const { handleSubmit, itemProps } = useForm({
 *     onSubmit(values: SignUpFormValues) {
 *       showToast(Toast.Style.Success, "Yay!", `${values.nickname} account created`);
 *     },
 *     validation: {
 *       nickname: FormValidation.Required,
 *       password: (value) => {
 *         if (value && value.length < 8) {
 *           return "Password must be at least 8 symbols";
 *         } else if (!value) {
 *           return "The item is required";
 *         }
 *       },
 *     },
 *   });
 *   return (
 *     <Form
 *       actions={
 *         <ActionPanel>
 *           <Action.SubmitForm title="Submit" onSubmit={handleSubmit} />
 *         </ActionPanel>
 *       }
 *     >
 *       <Form.TextField title="Nickname" placeholder="Enter your nickname" {...itemProps.nickname} />
 *       <Form.PasswordField
 *         title="Password"
 *         placeholder="Enter password at least 8 characters long"
 *         {...itemProps.password}
 *       />
 *     </Form>
 *   );
 * }
 * ```
 */
function useForm<T extends Form.Values>(props: {
  /** Callback that will be called when the form is submitted and all validations pass. */
  onSubmit: (values: T) => void | boolean | Promise<void | boolean>;
  /** Initial values of the form. */
  initialValues?: Partial<T>;
  /** Validation rules for the form. */
  validation?: Validation<T>;
}): FormProps<T> {
  const { onSubmit: _onSubmit, validation, initialValues = {} } = props;

  // @ts-expect-error it's fine if we don't specify all the values
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<{ [id in keyof T]?: ValidationError }>({});
  const refs = useRef<{ [id in keyof T]?: Form.ItemReference }>({});

  const latestValidation = useLatest<Validation<T>>(validation || {});
  const latestOnSubmit = useLatest(_onSubmit);

  const handleSubmit = useCallback(
    async (values: T): Promise<boolean> => {
      let validationErrors: false | { [key in keyof T]?: ValidationError } = false;
      for (const [id, validation] of Object.entries(latestValidation.current)) {
        const error = validationError(validation, values[id]);
        if (error) {
          if (!validationErrors) {
            validationErrors = {};
            // we focus the first item that has an error
            refs.current[id]?.focus();
          }
          validationErrors[id as keyof T] = error;
        }
      }
      if (validationErrors) {
        setErrors(validationErrors);
        return false;
      }
      const result = await latestOnSubmit.current(values);
      return typeof result === "boolean" ? result : true;
    },
    [latestValidation, latestOnSubmit]
  );

  const setValidationError = useCallback(
    (id: keyof T, error: ValidationError) => {
      setErrors((errors) => ({ ...errors, [id]: error }));
    },
    [setErrors]
  );

  const setValue = useCallback(
    function <K extends keyof T>(id: K, value: T[K]) {
      setValues((values) => ({ ...values, [id]: value }));
    },
    [setValues]
  );

  const itemProps = useMemo<{ [id in keyof T]: Partial<Form.ItemProps<T[id]>> & { id: string } }>(() => {
    // we have to use a proxy because we don't actually have any object to iterate through
    // so instead we dynamically create the props when required
    return new Proxy<{ [id in keyof T]: Partial<Form.ItemProps<T[id]>> & { id: string } }>(
      // @ts-expect-error the whole point of a proxy...
      {},
      {
        get(target, id: keyof T) {
          const validation = latestValidation.current[id];
          return {
            onChange(value) {
              if (errors[id]) {
                const error = validationError(validation, value);
                if (!error) {
                  setValidationError(id, undefined);
                }
              }
              setValue(id, value);
            },
            onBlur(event) {
              const error = validationError(validation, event.target.value);
              if (error) {
                setValidationError(id, error);
              }
            },
            error: errors[id],
            id,
            value: values[id],
            ref: (instance: Form.ItemReference) => {
              refs.current[id] = instance;
            },
          } as Partial<Form.ItemProps<T[keyof T]>> & { id: string };
        },
      }
    );
  }, [errors, latestValidation, setValidationError, values, refs, setValue]);

  return { handleSubmit, setValidationError, setValue, values, itemProps };
}

export { useForm };
