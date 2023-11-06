import { Form } from "@raycast/api";
import { useState, useCallback, useMemo, useRef, SetStateAction } from "react";
import { useLatest } from "./useLatest";

/**
 * Shorthands for common validation cases
 */
export enum FormValidation {
  /** Show an error when the value of the item is empty */
  Required = "required",
}

type ValidationError = string | undefined | null;
type Validator<ValueType> = ((value: ValueType | undefined) => ValidationError) | FormValidation;

function validationError<ValueType>(
  validation: Validator<ValueType> | undefined,
  value: ValueType | undefined,
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

interface FormProps<T extends Form.Values> {
  /** Function to pass to the `onSubmit` prop of the `<Action.SubmitForm>` element. It wraps the initial `onSubmit` argument with some goodies related to the validation. */
  handleSubmit: (values: T) => void | boolean | Promise<void | boolean>;
  /** The props that must be passed to the `<Form.Item>` elements to handle the validations. */
  itemProps: {
    [id in keyof Required<T>]: Partial<Form.ItemProps<T[id]>> & {
      id: string;
    };
  };
  /** Function that can be used to programmatically set the validation of a specific field. */
  setValidationError: (id: keyof T, error: ValidationError) => void;
  /** Function that can be used to programmatically set the value of a specific field. */
  setValue: <K extends keyof T>(id: K, value: SetStateAction<T[K]>) => void;
  /** The current values of the form. */
  values: T;
  /** Function that can be used to programmatically focus a specific field. */
  focus: (id: keyof T) => void;
  /** Function that can be used to reset the values of the Form. */
  reset: (initialValues?: Partial<T>) => void;
}

/**
 * Hook that provides a high-level interface to work with Forms, and more particularly, with Form validations. It incorporates all the good practices to provide a great User Experience for your Forms.
 *
 * @returns an object which contains the necessary methods and props to provide a good User Experience in your Form.
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
 * export default function Command() {
 *   const { handleSubmit, itemProps } = useForm<SignUpFormValues>({
 *     onSubmit(values) {
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
 *
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
  /** The initial values to set when the Form is first rendered. */
  initialValues?: Partial<T>;
  /** The validation rules for the Form. A validation for a Form item is a function that takes the current value of the item as an argument and must return a string when the validation is failing.
   *
   * There are also some shorthands for common cases, see {@link FormValidation}.
   * */
  validation?: Validation<T>;
}): FormProps<T> {
  const { onSubmit: _onSubmit, validation, initialValues = {} } = props;

  // @ts-expect-error it's fine if we don't specify all the values
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<{ [id in keyof T]?: ValidationError }>({});
  const refs = useRef<{ [id in keyof T]?: Form.ItemReference }>({});

  const latestValidation = useLatest<Validation<T>>(validation || {});
  const latestOnSubmit = useLatest(_onSubmit);

  const focus = useCallback(
    (id: keyof T) => {
      refs.current[id]?.focus();
    },
    [refs],
  );

  const handleSubmit = useCallback(
    async (values: T): Promise<boolean> => {
      let validationErrors: false | { [key in keyof T]?: ValidationError } = false;
      for (const [id, validation] of Object.entries(latestValidation.current)) {
        const error = validationError(validation, values[id]);
        if (error) {
          if (!validationErrors) {
            validationErrors = {};
            // we focus the first item that has an error
            focus(id);
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
    [latestValidation, latestOnSubmit, focus],
  );

  const setValidationError = useCallback(
    (id: keyof T, error: ValidationError) => {
      setErrors((errors) => ({ ...errors, [id]: error }));
    },
    [setErrors],
  );

  const setValue = useCallback(
    function <K extends keyof T>(id: K, value: SetStateAction<T[K]>) {
      // @ts-expect-error TS is always confused about SetStateAction, but it's fine here
      setValues((values) => ({ ...values, [id]: typeof value === "function" ? value(values[id]) : value }));
    },
    [setValues],
  );

  const itemProps = useMemo<{ [id in keyof Required<T>]: Partial<Form.ItemProps<T[id]>> & { id: string } }>(() => {
    // we have to use a proxy because we don't actually have any object to iterate through
    // so instead we dynamically create the props when required
    return new Proxy<{ [id in keyof Required<T>]: Partial<Form.ItemProps<T[id]>> & { id: string } }>(
      // @ts-expect-error the whole point of a proxy...
      {},
      {
        get(target, id: keyof T) {
          const validation = latestValidation.current[id];
          const value = values[id];
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
            // we shouldn't return `undefined` otherwise it will be an uncontrolled component
            value: typeof value === "undefined" ? null : value,
            ref: (instance: Form.ItemReference) => {
              refs.current[id] = instance;
            },
          } as Partial<Form.ItemProps<T[keyof T]>> & { id: string };
        },
      },
    );
  }, [errors, latestValidation, setValidationError, values, refs, setValue]);

  const reset = useCallback(
    (values?: Partial<T>) => {
      setErrors({});
      Object.entries(refs.current).forEach(([id, ref]) => {
        if (!values?.[id]) {
          ref?.reset();
        }
      });
      if (values) {
        // @ts-expect-error it's fine if we don't specify all the values
        setValues(values);
      }
    },
    [setValues, setErrors, refs],
  );

  return { handleSubmit, setValidationError, setValue, values, itemProps, focus, reset };
}

export { useForm };
