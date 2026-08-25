import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { RegistrationSection } from "@/components/RegistrationSection";
import { AppFooter } from "@/components/AppFooter";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2 md:px-4 lg:px-6 py-4 md:py-6 flex-1">
        <PageNav />
        <RegistrationSection />
      </main>
      <AppFooter />
    </div>
  );
};

export default Index;
