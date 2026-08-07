import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";

interface SignUpFormValues {
  firstName: string;
  lastName: string;
  birthday: Date | null;
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
        message: `${values.firstName} ${values.lastName} account created`,
      });
    },
    validation: {
      firstName: FormValidation.Required,
      lastName: FormValidation.Required,
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
