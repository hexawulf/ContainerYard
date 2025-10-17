import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitFork, Ship, Terminal } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <>
      <div className="relative isolate overflow-hidden bg-background">
        <div
          className="absolute inset-x-0 top-[-10rem] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[-20rem]"
          aria-hidden="true"
        >
          <div
            className="relative left-1/2 -z-10 aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-40rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
          />
        </div>
        <div className="mx-auto max-w-container px-6 py-24 sm:py-32 lg:flex lg:items-center lg:gap-x-10 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:flex-auto">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              A self-hosted container management platform
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Deploy, manage, and monitor your containerized applications with a simple, intuitive interface.
            </p>
            <div className="mt-10 flex items-center gap-x-6">
              <Link href="/dashboard">
                <Button size="lg">Open Dashboard</Button>
              </Link>
              <a href="https://github.com/hexawulf/ContainerYard" target="_blank" rel="noreferrer">
                <Button size="lg" variant="outline">
                  GitHub
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-container px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary">Deploy faster</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything you need to deploy your app
            </p>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              ContainerYard provides a simple, yet powerful interface for managing your containers.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ship className="h-6 w-6" />
                    Containerization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  Deploy your applications as containers, ensuring consistency across different environments.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="h-6 w-6" />
                    Real-time Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  Monitor your applications in real-time with a live log stream, right from the dashboard.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitFork className="h-6 w-6" />
                    Open Source
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  ContainerYard is open source, so you can contribute to its development and customize it to your needs.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LandingPage;